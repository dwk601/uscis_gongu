package uscis

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tests"
	"github.com/jackc/pgx/v5"
)

func TestInsightsContract(t *testing.T) {
	ctx := context.Background()
	adminURL := os.Getenv("GONGU_TEST_ADMIN_DATABASE_URL")
	if adminURL == "" {
		t.Fatal("GONGU_TEST_ADMIN_DATABASE_URL must point to a local PostgreSQL admin database (e.g. postgresql:///postgres)")
	}
	cfg, err := pgx.ParseConfig(adminURL)
	if err != nil {
		t.Fatal(err)
	}
	local := func(host string) bool {
		if host == "localhost" || strings.HasPrefix(host, "/") {
			return true
		}
		ip := net.ParseIP(host)
		return ip != nil && ip.IsLoopback()
	}
	if !local(cfg.Host) {
		t.Fatal("GONGU_TEST_ADMIN_DATABASE_URL must use a local host or Unix socket")
	}
	for _, fallback := range cfg.Fallbacks {
		if !local(fallback.Host) {
			t.Fatal("GONGU_TEST_ADMIN_DATABASE_URL must use only local hosts")
		}
	}
	admin, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close(ctx)
	var random [8]byte
	if _, err = rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	suffix := hex.EncodeToString(random[:])
	dbname := "gongu_insights_" + suffix
	role := "gongu_reader_" + suffix
	password := hex.EncodeToString(random[:])
	dbIdent := pgx.Identifier{dbname}.Sanitize()
	roleIdent := pgx.Identifier{role}.Sanitize()
	exec := func(conn *pgx.Conn, sql string) {
		t.Helper()
		if _, err := conn.Exec(ctx, sql); err != nil {
			t.Fatalf("database setup: %v", err)
		}
	}
	exec(admin, "CREATE ROLE "+roleIdent+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '"+password+"'")
	defer func() {
		if _, err := admin.Exec(ctx, "DROP ROLE "+roleIdent); err != nil {
			t.Errorf("drop role: %v", err)
		}
	}()
	exec(admin, "ALTER ROLE "+roleIdent+" SET default_transaction_read_only = on")
	exec(admin, "CREATE DATABASE "+dbIdent)
	defer func() {
		if _, err := admin.Exec(ctx, "DROP DATABASE "+dbIdent+" WITH (FORCE)"); err != nil {
			t.Errorf("drop database: %v", err)
		}
	}()
	exec(admin, "REVOKE TEMPORARY ON DATABASE "+dbIdent+" FROM PUBLIC")
	fixtureCfg := cfg.Copy()
	fixtureCfg.Database = dbname
	fixture, err := pgx.ConnectConfig(ctx, fixtureCfg)
	if err != nil {
		t.Fatal(err)
	}
	defer fixture.Close(ctx)
	sql, err := os.ReadFile(filepath.Join("testdata", "insights.sql"))
	if err != nil {
		t.Fatal(err)
	}
	exec(fixture, string(sql))
	exec(fixture, "GRANT SELECT ON public.immihelp_timeline, public.dol_lca_pay_stats, public.h1b_employer, public.student_post_week TO "+roleIdent)
	appURL := url.URL{Scheme: "postgresql", User: url.UserPassword(role, password), Host: net.JoinHostPort("127.0.0.1", fmt.Sprint(cfg.Port)), Path: "/" + dbname, RawQuery: "sslmode=disable"}
	t.Setenv(databaseURLEnv, appURL.String())
	newMux := func() http.Handler {
		t.Helper()
		app, err := tests.NewTestApp(t.TempDir())
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(app.Cleanup)
		Register(app)
		router, err := apis.NewRouter(app)
		if err != nil {
			t.Fatal(err)
		}
		var mux http.Handler
		err = app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(e *core.ServeEvent) error { var err error; mux, err = e.Router.BuildMux(); return err })
		if err != nil {
			t.Fatal(err)
		}
		return mux
	}
	mux := newMux()
	cases := []struct {
		name, path string
		status     int
		check      func(*testing.T, []byte)
	}{
		{"visa KM and boundaries", "/api/x/uscis/insights/visa-221g", 200, func(t *testing.T, b []byte) {
			var v visaResponse
			if err := json.Unmarshal(b, &v); err != nil {
				t.Fatal(err)
			}
			if v.Status != "ready" || v.Excluded != 1 || len(v.Groups) != 3 || v.From == nil || *v.From != "2024-01-01" || v.To == nil || *v.To != "2024-01-01" {
				t.Fatalf("visa: %s", b)
			}
			g := v.Groups[0]
			if g.Included != 100 || g.Decisions != 59 || g.Censored != 41 || g.P90Days == nil || *g.P90Days != 10 || len(g.Curve) != 2 || g.Curve[1].AtRisk != 60 || v.Groups[1].Office != "Small" || v.Groups[1].Included != 30 || v.Groups[1].Decisions != 29 || v.Groups[1].MedianDays != nil || v.Groups[1].P90Days != nil || v.Groups[2].Office != "Thirty" || v.Groups[2].Included != 30 {
				t.Fatalf("visa curve: %s", b)
			}
			p := g.Curve[1]
			if math.Abs(p.Waiting-1.0/60) > 1e-12 || p.Low == nil || p.High == nil || math.Abs(*p.Low-0.0013854194746663975) > 1e-12 || math.Abs(*p.High-0.07831704511866291) > 1e-12 {
				t.Fatalf("Greenwood band: %s", b)
			}
		}},
		{"invalid query", "/api/x/uscis/insights/visa-221g?year=2025", 400, nil},
		{"pay catalog", "/api/x/uscis/insights/h1b-pay", 200, func(t *testing.T, b []byte) {
			var v payCatalog
			if err := json.Unmarshal(b, &v); err != nil || len(v.Years) != 1 || v.Years[0].Titles[0].Key != "SOFTWARE ENGINEER" || v.Years[0].From != "2024-10-01" {
				t.Fatalf("catalog: %s (%v)", b, err)
			}
		}},
		{"pay title", "/api/x/uscis/insights/h1b-pay?year=2025&title=SOFTWARE%20ENGINEER", 200, func(t *testing.T, b []byte) {
			var v payDetail
			if err := json.Unmarshal(b, &v); err != nil || len(v.States) != 2 || v.States[0].State != "CA" || v.All.Cases == nil || *v.All.Cases != 100 {
				t.Fatalf("pay: %s (%v)", b, err)
			}
		}},
		{"unknown title", "/api/x/uscis/insights/h1b-pay?year=2025&title=NOPE", 400, nil},
		{"employer ranking", "/api/x/uscis/insights/h1b-employers", 200, func(t *testing.T, b []byte) {
			var v employersResponse
			if err := json.Unmarshal(b, &v); err != nil || len(v.Employers) != 20 || v.Employers[0].Name != "Employer 01" || v.Employers[0].InitialApprovals != 101 || v.Employers[1].Name != "A Employer" || v.Employers[2].Name != "Employer 25" || strings.Contains(string(b), "secret") || strings.Contains(string(b), "tax") {
				t.Fatalf("employers: %s (%v)", b, err)
			}
		}},
		{"unknown employer year", "/api/x/uscis/insights/h1b-employers?year=1900", 400, nil},
		{"student baseline", "/api/x/uscis/insights/student-posts", 200, func(t *testing.T, b []byte) {
			var v studentResponse
			if err := json.Unmarshal(b, &v); err != nil || len(v.Weeks) != 15 {
				t.Fatalf("student: %s (%v)", b, err)
			}
			z := v.Weeks[12].Z.Sevis
			if z == nil || math.Abs(*z-18.5/math.Sqrt(13)) > 1e-9 || v.Weeks[13].Covered || v.Weeks[13].Sevis != nil || v.Weeks[14].Z.Sevis != nil {
				t.Fatalf("student z: %s", b)
			}
		}},
		{"missing pay view", "/api/x/uscis/insights/h1b-pay", 503, func(t *testing.T, b []byte) {
			if !strings.Contains(string(b), "USCIS database unavailable.") {
				t.Fatalf("error: %s", b)
			}
		}},
		{"missing student view", "/api/x/uscis/insights/student-posts", 503, func(t *testing.T, b []byte) {
			if !strings.Contains(string(b), "USCIS database unavailable.") {
				t.Fatalf("error: %s", b)
			}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.name == "missing pay view" {
				exec(fixture, "DROP VIEW public.dol_lca_pay_stats")
				mux = newMux()
			}
			if tc.name == "missing student view" {
				exec(fixture, "DROP VIEW public.student_post_week")
				mux = newMux()
			}
			res := httptest.NewRecorder()
			mux.ServeHTTP(res, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if res.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", res.Code, tc.status, res.Body.String())
			}
			if res.Body.Len() > 200*1024 {
				t.Fatal("response exceeds 200 KiB")
			}
			if tc.check != nil {
				tc.check(t, res.Body.Bytes())
			}
		})
	}
}
