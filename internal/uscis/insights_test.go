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
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tests"
	"github.com/jackc/pgx/v5"
)

func TestInsightsContract(t *testing.T) {
	// These shapes are the browser's JSON contract, independent of handler types.
	type curvePoint struct {
		Day     int      `json:"day"`
		Waiting float64  `json:"waiting"`
		Low     *float64 `json:"low"`
		High    *float64 `json:"high"`
		AtRisk  int      `json:"atRisk"`
	}
	type visaGroupJSON struct {
		Office     string       `json:"office"`
		Included   int          `json:"included"`
		Decisions  int          `json:"decisions"`
		Censored   int          `json:"censored"`
		MedianDays *int         `json:"medianDays"`
		P90Days    *int         `json:"p90Days"`
		Curve      []curvePoint `json:"curve"`
	}
	type visaJSON struct {
		Status     string          `json:"status"`
		Historical bool            `json:"historical"`
		Source     string          `json:"source"`
		From       *string         `json:"from"`
		To         *string         `json:"to"`
		Excluded   int             `json:"excluded"`
		Groups     []visaGroupJSON `json:"groups"`
	}
	type titleJSON struct {
		Key   string `json:"key"`
		Title string `json:"title"`
		Cases int    `json:"cases"`
	}
	type yearJSON struct {
		Year   int         `json:"year"`
		From   string      `json:"from"`
		To     string      `json:"to"`
		Titles []titleJSON `json:"titles"`
	}
	type catalogJSON struct {
		Years []yearJSON `json:"years"`
	}
	type boxJSON struct {
		Cases *int     `json:"cases"`
		P10   *float64 `json:"p10"`
		P25   *float64 `json:"p25"`
		P50   *float64 `json:"p50"`
		P75   *float64 `json:"p75"`
		P90   *float64 `json:"p90"`
	}
	type stateJSON struct {
		State string   `json:"state"`
		Cases *int     `json:"cases"`
		P10   *float64 `json:"p10"`
		P25   *float64 `json:"p25"`
		P50   *float64 `json:"p50"`
		P75   *float64 `json:"p75"`
		P90   *float64 `json:"p90"`
	}
	type payJSON struct {
		Year   int         `json:"year"`
		Key    string      `json:"key"`
		Title  string      `json:"title"`
		All    boxJSON     `json:"all"`
		States []stateJSON `json:"states"`
	}
	type employerJSON struct {
		Name                string `json:"name"`
		InitialApprovals    int64  `json:"initialApprovals"`
		InitialDenials      int64  `json:"initialDenials"`
		ContinuingApprovals int64  `json:"continuingApprovals"`
	}
	type employersJSON struct {
		Years     []int32        `json:"years"`
		Year      *int32         `json:"year"`
		Employers []employerJSON `json:"employers"`
	}
	type zJSON struct {
		Sevis  *float64 `json:"sevis"`
		CPT    *float64 `json:"cpt"`
		Policy *float64 `json:"policy"`
	}
	type weekJSON struct {
		Week    string `json:"week"`
		Covered bool   `json:"covered"`
		All     *int   `json:"all"`
		Sevis   *int   `json:"sevis"`
		CPT     *int   `json:"cpt"`
		Policy  *int   `json:"policy"`
		Z       zJSON  `json:"z"`
	}
	type totalJSON struct {
		Posts int64 `json:"posts"`
	}
	type topicsJSON struct {
		Sevis  totalJSON `json:"sevis"`
		CPT    totalJSON `json:"cpt"`
		Policy totalJSON `json:"policy"`
	}
	type studentJSON struct {
		From   *string    `json:"from"`
		To     *string    `json:"to"`
		Weeks  []weekJSON `json:"weeks"`
		Topics topicsJSON `json:"topics"`
	}
	var requireKeys func(*testing.T, json.RawMessage, reflect.Type)
	requireKeys = func(t *testing.T, raw json.RawMessage, typ reflect.Type) {
		t.Helper()
		if typ.Kind() == reflect.Pointer {
			if string(raw) == "null" {
				return
			}
			typ = typ.Elem()
		}
		switch typ.Kind() {
		case reflect.Struct:
			var fields map[string]json.RawMessage
			if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
				t.Fatalf("expected object: %s (%v)", raw, err)
			}
			for i := 0; i < typ.NumField(); i++ {
				field := typ.Field(i)
				key := field.Tag.Get("json")
				value, ok := fields[key]
				if !ok {
					t.Fatalf("missing JSON key %q in %s", key, raw)
				}
				requireKeys(t, value, field.Type)
			}
		case reflect.Slice:
			var values []json.RawMessage
			if err := json.Unmarshal(raw, &values); err != nil || values == nil {
				t.Fatalf("expected array: %s (%v)", raw, err)
			}
			for _, value := range values {
				requireKeys(t, value, typ.Elem())
			}
		}
	}
	decode := func(t *testing.T, raw []byte, out any) error {
		t.Helper()
		if err := json.Unmarshal(raw, out); err != nil {
			return err
		}
		requireKeys(t, raw, reflect.TypeOf(out).Elem())
		return nil
	}
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
	execSQL := func(conn *pgx.Conn, sql string) {
		t.Helper()
		if _, err := conn.Exec(ctx, sql); err != nil {
			t.Fatalf("database setup: %v", err)
		}
	}
	dbname := os.Getenv("GONGU_INSIGHTS_CHILD_DB")
	role := os.Getenv("GONGU_INSIGHTS_CHILD_ROLE")
	if dbname == "" {
		admin, err := pgx.ConnectConfig(ctx, cfg)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { admin.Close(ctx) })
		var random [8]byte
		if _, err := rand.Read(random[:]); err != nil {
			t.Fatal(err)
		}
		suffix := hex.EncodeToString(random[:])
		dbname = "gongu_insights_" + suffix
		role = "gongu_reader_" + suffix
		password := suffix
		dbIdent := pgx.Identifier{dbname}.Sanitize()
		roleIdent := pgx.Identifier{role}.Sanitize()
		execSQL(admin, "CREATE ROLE "+roleIdent+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '"+password+"'")
		t.Cleanup(func() {
			if _, err := admin.Exec(ctx, "DROP ROLE "+roleIdent); err != nil {
				t.Errorf("drop role: %v", err)
			}
		})
		execSQL(admin, "ALTER ROLE "+roleIdent+" SET default_transaction_read_only = on")
		execSQL(admin, "CREATE DATABASE "+dbIdent)
		t.Cleanup(func() {
			if _, err := admin.Exec(ctx, "DROP DATABASE "+dbIdent+" WITH (FORCE)"); err != nil {
				t.Errorf("drop database: %v", err)
			}
		})
		execSQL(admin, "REVOKE TEMPORARY ON DATABASE "+dbIdent+" FROM PUBLIC")
		fixtureCfg := cfg.Copy()
		fixtureCfg.Database = dbname
		fixture, err := pgx.ConnectConfig(ctx, fixtureCfg)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { fixture.Close(ctx) })
		sql, err := os.ReadFile(filepath.Join("testdata", "insights.sql"))
		if err != nil {
			t.Fatal(err)
		}
		execSQL(fixture, string(sql))
		execSQL(fixture, "GRANT SELECT ON public.immihelp_timeline, public.dol_lca_pay_stats, public.h1b_employer, public.student_post_week, public.uscis_form_quarter, public.case_estimate_current, public.case_community_stats, public.source_refresh_status, public.reddit_timeline_vs_uscis_quarter, public.reddit_green_card_month_vs_bulletin, public.reddit_h1b_month_vs_lca, public.reddit_activity_day TO "+roleIdent)
		appURL := url.URL{Scheme: "postgresql", User: url.UserPassword(role, password), Host: net.JoinHostPort("127.0.0.1", fmt.Sprint(cfg.Port)), Path: "/" + dbname, RawQuery: "sslmode=disable"}
		// A separate process keeps cleanup in this parent even if a handler goroutine panics.
		cmd := exec.Command(os.Args[0], "-test.run=^TestInsightsContract$", "-test.count=1")
		cmd.Env = append(os.Environ(), "GONGU_INSIGHTS_CHILD_DB="+dbname, "GONGU_INSIGHTS_CHILD_ROLE="+role, databaseURLEnv+"="+appURL.String())
		output, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("HTTP contract subprocess: %v\n%s", err, output)
		}
		return
	}
	fixtureCfg := cfg.Copy()
	fixtureCfg.Database = dbname
	fixture, err := pgx.ConnectConfig(ctx, fixtureCfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { fixture.Close(ctx) })
	roleIdent := pgx.Identifier{role}.Sanitize()
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
	request := func(mux http.Handler, path string) *httptest.ResponseRecorder {
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, httptest.NewRequest(http.MethodGet, path, nil))
		return res
	}
	replace := func(view, query string) {
		t.Helper()
		ident := pgx.Identifier{"public", view}.Sanitize()
		execSQL(fixture, "DROP VIEW "+ident)
		execSQL(fixture, "CREATE VIEW "+ident+" AS "+query)
		execSQL(fixture, "GRANT SELECT ON "+ident+" TO "+roleIdent)
	}
	mux := newMux()
	type testCase struct {
		name, path string
		status     int
		setup      func()
		check      func(*testing.T, []byte)
	}
	cases := []testCase{
		{name: "case default", path: "/api/x/uscis/case?form=I-485", status: 200, check: func(t *testing.T, b []byte) {
			var v struct {
				CategoryLabel string `json:"categoryLabel"`
				Community     *struct {
					FilingYear int `json:"filingYear"`
				} `json:"community"`
				Summary struct {
					EligibleReports int   `json:"eligibleReports"`
					Years           []int `json:"years"`
				} `json:"summary"`
				Freshness []struct {
					LatestAttemptFailed bool `json:"latestAttemptFailed"`
				} `json:"freshness"`
			}
			if err := json.Unmarshal(b, &v); err != nil || v.CategoryLabel != "Family" || v.Community == nil || v.Community.FilingYear != 2025 || v.Summary.EligibleReports != 18 || !reflect.DeepEqual(v.Summary.Years, []int{2024, 2025}) || len(v.Freshness) != 1 || !v.Freshness[0].LatestAttemptFailed {
				t.Fatalf("case: %s (%v)", b, err)
			}
		}},
		{name: "case exact year", path: "/api/x/uscis/case?form=I-485&filingYear=2024", status: 200, check: func(t *testing.T, b []byte) {
			var v struct {
				Community *struct {
					FilingYear int `json:"filingYear"`
				} `json:"community"`
			}
			if err := json.Unmarshal(b, &v); err != nil || v.Community == nil || v.Community.FilingYear != 2024 {
				t.Fatalf("case: %s", b)
			}
		}},
		{name: "case future", path: "/api/x/uscis/case?form=I-485&filingYear=2030", status: 200, check: func(t *testing.T, b []byte) {
			var v struct {
				Community *json.RawMessage `json:"community"`
			}
			if err := json.Unmarshal(b, &v); err != nil || v.Community != nil {
				t.Fatalf("case: %s", b)
			}
		}},
		{name: "case preferred work permit", path: "/api/x/uscis/case?form=I-765", status: 200, check: func(t *testing.T, b []byte) {
			var v struct {
				CategoryLabel string `json:"categoryLabel"`
			}
			if err := json.Unmarshal(b, &v); err != nil || v.CategoryLabel != "Adjustment of status" {
				t.Fatalf("case: %s", b)
			}
		}},
		{name: "case unknown", path: "/api/x/uscis/case?form=ZZZ", status: 404},
		{name: "case invalid year", path: "/api/x/uscis/case?form=I-485&filingYear=abc", status: 400},
		{name: "case missing grant", path: "/api/x/uscis/case?form=I-485", status: 503, setup: func() {
			execSQL(fixture, "REVOKE SELECT ON public.case_community_stats FROM "+roleIdent)
			mux = newMux()
		}},
		{name: "reddit timeline grouping", path: "/api/x/uscis/forms/I-765/reddit", status: 200, check: func(t *testing.T, b []byte) {
			var v struct {
				OfficialDescription string         `json:"officialDescription"`
				Series              []redditSeries `json:"series"`
			}
			if err := json.Unmarshal(b, &v); err != nil || v.OfficialDescription != redditDescriptions["I-765"] || len(v.Series) != 2 || v.Series[0].Premium != nil || v.Series[1].Premium == nil || *v.Series[1].Premium || len(v.Series[0].Points) != 1 || v.Series[0].Points[0].QuarterStart != nil {
				t.Fatalf("timeline: %s (%v)", b, err)
			}
		}},
		{name: "reddit unmapped", path: "/api/x/uscis/forms/I-485/reddit", status: 200, check: func(t *testing.T, b []byte) {
			if string(b) != `{"officialDescription":null,"series":[]}` {
				t.Fatalf("unmapped: %s", b)
			}
		}},
		{name: "reddit unknown", path: "/api/x/uscis/forms/NOPE/reddit", status: 404},
		{name: "reddit invalid query", path: "/api/x/uscis/bulletin/discussion?x=1&x=2", status: 400},
		{name: "reddit discussion distinct", path: "/api/x/uscis/bulletin/discussion", status: 200, check: func(t *testing.T, b []byte) {
			var v discussionResponse
			if err := json.Unmarshal(b, &v); err != nil || len(v.Months) != 1 || *v.Months[0].Posts != 10 || *v.From != "2021-10-30" || *v.Through != "2026-11-04" {
				t.Fatalf("discussion: %s (%v)", b, err)
			}
		}},
		{name: "reddit talk nulls", path: "/api/x/uscis/insights/h1b-talk", status: 200, check: func(t *testing.T, b []byte) {
			var v talkResponse
			if err := json.Unmarshal(b, &v); err != nil || len(v.Months) != 1 || v.Months[0].LcaCases != nil || *v.Months[0].H1bPosts != 3 || *v.Through != "2026-11-04" {
				t.Fatalf("talk: %s (%v)", b, err)
			}
		}},
		{name: "reddit missing view", path: "/api/x/uscis/insights/h1b-talk", status: 503, setup: func() { execSQL(fixture, "DROP VIEW public.reddit_h1b_month_vs_lca"); mux = newMux() }},
		{name: "visa KM and censoring", path: "/api/x/uscis/insights/visa-221g", status: 200, check: func(t *testing.T, b []byte) {
			var v visaJSON
			if err := decode(t, b, &v); err != nil {
				t.Fatal(err)
			}
			if v.Status != "ready" || v.Excluded != 4 || len(v.Groups) != 3 || v.From == nil || *v.From != "2024-01-01" || v.To == nil || *v.To != "2024-01-01" {
				t.Fatalf("visa: %s", b)
			}
			g := v.Groups[0]
			if g.Included != 103 || g.Decisions != 59 || g.Censored != 44 || g.P90Days == nil || *g.P90Days != 10 || len(g.Curve) != 3 || g.Curve[1].AtRisk != 61 || g.Curve[2].AtRisk != 2 || v.Groups[1].Office != "Small" || v.Groups[1].Included != 30 || v.Groups[1].Decisions != 29 || v.Groups[1].MedianDays != nil || v.Groups[1].P90Days != nil || v.Groups[2].Office != "Thirty" || v.Groups[2].Included != 30 || v.Groups[2].MedianDays == nil || *v.Groups[2].MedianDays != 10 || v.Groups[2].P90Days == nil || *v.Groups[2].P90Days != 10 {
				t.Fatalf("visa curve: %s", b)
			}
			p, q := g.Curve[1], g.Curve[2]
			if math.Abs(p.Waiting-3.0/61) > 1e-12 || p.Low == nil || p.High == nil || math.Abs(*p.Low-0.012973128859312769) > 1e-12 || math.Abs(*p.High-0.12388853825765767) > 1e-12 || math.Abs(q.Waiting-3.0/122) > 1e-12 || q.Low == nil || q.High == nil || math.Abs(*q.Low-0.002537001801897982) > 1e-12 || math.Abs(*q.High-0.10053638310893542) > 1e-12 {
				t.Fatalf("Greenwood band: %s", b)
			}
		}},
		{name: "invalid query", path: "/api/x/uscis/insights/visa-221g?year=2025", status: 400},
		{name: "pay catalog", path: "/api/x/uscis/insights/h1b-pay", status: 200, check: func(t *testing.T, b []byte) {
			var v catalogJSON
			if err := decode(t, b, &v); err != nil || len(v.Years) != 2 || v.Years[0].Year != 2026 || v.Years[1].Year != 2025 || len(v.Years[1].Titles) != 2 || v.Years[1].Titles[0].Key != "SOFTWARE ENGINEER" || v.Years[1].From != "2024-10-01" || v.Years[1].To != "2025-09-30" {
				t.Fatalf("catalog: %s (%v)", b, err)
			}
		}},
		{name: "pay title", path: "/api/x/uscis/insights/h1b-pay?year=2025&title=SOFTWARE%20ENGINEER", status: 200, check: func(t *testing.T, b []byte) {
			var v payJSON
			if err := decode(t, b, &v); err != nil || len(v.States) != 2 || v.States[0].State != "CA" || v.All.Cases == nil || *v.All.Cases != 100 {
				t.Fatalf("pay: %s (%v)", b, err)
			}
		}},
		{name: "pay requires title", path: "/api/x/uscis/insights/h1b-pay?year=2025", status: 400},
		{name: "unknown title", path: "/api/x/uscis/insights/h1b-pay?year=2025&title=NOPE", status: 400},
		{name: "employer ranking and latest year", path: "/api/x/uscis/insights/h1b-employers", status: 200, check: func(t *testing.T, b []byte) {
			var v employersJSON
			if err := decode(t, b, &v); err != nil || v.Year == nil || *v.Year != 2025 || len(v.Years) != 2 || v.Years[0] != 2025 || v.Years[1] != 2024 || len(v.Employers) != 20 || v.Employers[0].Name != "Employer 01" || v.Employers[0].InitialApprovals != 101 || v.Employers[1].Name != "A Employer" || v.Employers[2].Name != "Employer 25" || strings.Contains(string(b), "secret") || strings.Contains(string(b), "tax") {
				t.Fatalf("employers: %s (%v)", b, err)
			}
		}},
		{name: "unknown employer year", path: "/api/x/uscis/insights/h1b-employers?year=1900", status: 400},
		{name: "student baseline", path: "/api/x/uscis/insights/student-posts", status: 200, check: func(t *testing.T, b []byte) {
			var v studentJSON
			if err := decode(t, b, &v); err != nil || len(v.Weeks) != 15 {
				t.Fatalf("student: %s (%v)", b, err)
			}
			z := v.Weeks[12].Z.Sevis
			if z == nil || math.Abs(*z-18.5/math.Sqrt(13)) > 1e-9 || v.Weeks[12].Z.CPT != nil || v.Topics.CPT.Posts != 6 || v.Weeks[12].Z.Policy != nil || v.Topics.Policy.Posts != 42 || v.Weeks[13].Covered || v.Weeks[13].Sevis != nil || v.Weeks[14].Z.Sevis != nil {
				t.Fatalf("student z: %s", b)
			}
		}},
		{name: "pay browsing preserves shared cache", path: "/api/x/uscis/insights/h1b-pay", status: 200, setup: func() {
			execSQL(fixture, "ALTER VIEW public.dol_lca_pay_stats RENAME TO saved_pay")
			execSQL(fixture, `CREATE VIEW public.dol_lca_pay_stats AS SELECT fiscal_year, ('TITLE ' || n)::text AS title_key, job_title, n::int AS title_rank, worksite_state, cases, p10, p25, p50, p75, p90, first_received, last_received FROM public.saved_pay CROSS JOIN generate_series(1,260) n WHERE title_key='SOFTWARE ENGINEER' AND worksite_state IS NULL`)
			execSQL(fixture, "GRANT SELECT ON public.dol_lca_pay_stats TO "+roleIdent)
			mux = newMux()
		}, check: func(t *testing.T, _ []byte) {
			if res := request(mux, "/api/x/uscis/insights/h1b-employers"); res.Code != 200 {
				t.Fatalf("prime employer cache: %d %s", res.Code, res.Body.String())
			}
			for i := 1; i <= 260; i++ {
				res := request(mux, fmt.Sprintf("/api/x/uscis/insights/h1b-pay?year=2025&title=TITLE%%20%d", i))
				if res.Code != 200 {
					t.Fatalf("pay title %d: %d %s", i, res.Code, res.Body.String())
				}
			}
			execSQL(fixture, "ALTER VIEW public.h1b_employer RENAME TO saved_employer_cache")
			if res := request(mux, "/api/x/uscis/insights/h1b-employers"); res.Code != 200 {
				t.Fatalf("shared employer cache evicted: %d %s", res.Code, res.Body.String())
			}
			execSQL(fixture, "ALTER VIEW public.saved_employer_cache RENAME TO h1b_employer")
			execSQL(fixture, "DROP VIEW public.dol_lca_pay_stats")
			execSQL(fixture, "ALTER VIEW public.saved_pay RENAME TO dol_lca_pay_stats")
			mux = newMux()
		}},
		{name: "KM exact thresholds", path: "/api/x/uscis/insights/visa-221g", status: 200, setup: func() {
			replace("immihelp_timeline", `SELECT '221g-tracker'::text tracker,'F1'::text category, office, '2024-01-01'::date start_date, ('2024-01-01'::date + CASE WHEN office='Threshold' THEN CASE WHEN n<=20 THEN 0 WHEN n<=50 THEN 1 WHEN n<=80 THEN 2 WHEN n<=91 THEN 3 ELSE 4 END ELSE CASE WHEN n<=21 THEN 0 WHEN n<=50 THEN 1 WHEN n<=96 THEN 2 WHEN n<=98 THEN 3 WHEN n<=99 THEN 4 ELSE 5 END END)::date decision_date, '2024-02-01'::timestamptz first_seen_at, NULL::timestamptz updated_at, false pending FROM generate_series(1,100) n CROSS JOIN (VALUES ('Threshold'::text),('Precision'::text)) o(office)`)
			mux = newMux()
		}, check: func(t *testing.T, b []byte) {
			var v visaJSON
			if err := decode(t, b, &v); err != nil || len(v.Groups) != 3 {
				t.Fatalf("thresholds: %s (%v)", b, err)
			}
			for _, g := range v.Groups[1:] {
				if g.MedianDays == nil || *g.MedianDays != 1 {
					t.Fatalf("median: %s", b)
				}
				if g.Office == "Threshold" && (g.P90Days == nil || *g.P90Days != 3) {
					t.Fatalf("p90: %s", b)
				}
			}
		}},
		{name: "pooled insufficient", path: "/api/x/uscis/insights/visa-221g", status: 200, setup: func() {
			execSQL(fixture, "ALTER VIEW public.immihelp_timeline RENAME TO saved_visa")
			execSQL(fixture, "CREATE VIEW public.immihelp_timeline AS SELECT * FROM public.saved_visa LIMIT 29")
			execSQL(fixture, "GRANT SELECT ON public.immihelp_timeline TO "+roleIdent)
			mux = newMux()
		}, check: func(t *testing.T, b []byte) {
			var v visaJSON
			if err := decode(t, b, &v); err != nil || v.Status != "insufficient_data" || len(v.Groups) != 0 {
				t.Fatalf("insufficient: %s (%v)", b, err)
			}
		}},
		{name: "student gap", path: "/api/x/uscis/insights/student-posts", status: 200, setup: func() {
			execSQL(fixture, "ALTER VIEW public.student_post_week RENAME TO saved_student")
			execSQL(fixture, "CREATE VIEW public.student_post_week AS SELECT week_start, topic, CASE WHEN week_start = '2024-04-01' THEN 5 ELSE posts END AS posts, CASE WHEN week_start = '2024-04-01' THEN true ELSE covered END AS covered FROM public.saved_student WHERE week_start <> '2024-02-05'")
			execSQL(fixture, "GRANT SELECT ON public.student_post_week TO "+roleIdent)
			mux = newMux()
		}, check: func(t *testing.T, b []byte) {
			var v studentJSON
			if err := decode(t, b, &v); err != nil || len(v.Weeks) != 14 || !v.Weeks[13].Covered || v.Weeks[13].Z.Sevis != nil {
				t.Fatalf("gap: %s (%v)", b, err)
			}
		}},
		{name: "oversized payload", path: "/api/x/uscis/insights/student-posts", status: 503, setup: func() {
			replace("student_post_week", `SELECT ('2000-01-03'::date+n*7)::date week_start, topic::text, 3::int posts, true covered FROM generate_series(0,3000) n CROSS JOIN (VALUES ('all'),('sevis'),('cpt'),('policy')) t(topic)`)
			mux = newMux()
		}},
		{name: "empty employers", path: "/api/x/uscis/insights/h1b-employers", status: 200, setup: func() {
			execSQL(fixture, "ALTER VIEW public.h1b_employer RENAME TO saved_employer")
			execSQL(fixture, "CREATE VIEW public.h1b_employer AS SELECT * FROM public.saved_employer WHERE false")
			execSQL(fixture, "GRANT SELECT ON public.h1b_employer TO "+roleIdent)
			mux = newMux()
		}, check: func(t *testing.T, b []byte) {
			if string(b) != `{"years":[],"year":null,"employers":[]}` {
				t.Fatalf("empty employers: %s", b)
			}
		}},
		{name: "missing visa", path: "/api/x/uscis/insights/visa-221g", status: 503, setup: func() { execSQL(fixture, "DROP VIEW public.immihelp_timeline"); mux = newMux() }},
		{name: "missing employers", path: "/api/x/uscis/insights/h1b-employers", status: 503, setup: func() { execSQL(fixture, "DROP VIEW public.h1b_employer"); mux = newMux() }},
		{name: "missing pay detail", path: "/api/x/uscis/insights/h1b-pay?year=2025&title=SOFTWARE%20ENGINEER", status: 503, setup: func() {
			mux = newMux()
			res := request(mux, "/api/x/uscis/insights/h1b-pay")
			if res.Code != 200 {
				t.Fatalf("prime catalog: %s", res.Body.String())
			}
			execSQL(fixture, "DROP VIEW public.dol_lca_pay_stats")
		}},
		{name: "missing pay", path: "/api/x/uscis/insights/h1b-pay", status: 503, setup: func() { mux = newMux() }},
		{name: "missing student", path: "/api/x/uscis/insights/student-posts", status: 503, setup: func() { execSQL(fixture, "DROP VIEW public.student_post_week"); mux = newMux() }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.setup != nil {
				tc.setup()
			}
			res := request(mux, tc.path)
			if res.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", res.Code, tc.status, res.Body.String())
			}
			if res.Body.Len() > 200*1024 {
				t.Fatal("response exceeds 200 KiB")
			}
			if tc.status == 503 && !strings.Contains(res.Body.String(), "USCIS database unavailable.") {
				t.Fatalf("error: %s", res.Body.String())
			}
			if tc.check != nil {
				tc.check(t, res.Body.Bytes())
			}
		})
	}
}
