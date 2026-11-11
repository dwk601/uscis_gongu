package migrations

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tests"

	"gongu/internal/accounts"
)

func TestCommunityRules(t *testing.T) {
	const a = "aaaaaaaaaaaaaaa"
	const b = "bbbbbbbbbbbbbbb"
	const admin = "ddddddddddddddd"
	const post = "ppppppppppppppp"
	const other = "qqqqqqqqqqqqqqq"
	const vote = "vvvvvvvvvvvvvvv"
	cases := []struct {
		name, method, path, body, actor string
		status                          int
		content                         []string
		gone                            []string
	}{
		{"public feed", "GET", "post_feed/records", "", "", 200, []string{`"votes":2`, `"comments":3`, `"author_name":"Alice"`}, nil},
		{"public comment feed", "GET", "comment_feed/records", "", "", 200, []string{`"author_name":"Alice"`, `"body":"hello"`}, nil},
		{"signup burst", "POST", "users/records", `{"email":"burst10@example.com","password":"password123","passwordConfirm":"password123"}`, "", 429, []string{"message"}, nil},
		{"posts burst", "POST", "posts/records", `{"title":"hello","author":"` + a + `"}`, a, 429, []string{"message"}, nil},
		{"comments burst", "POST", "comments/records", `{"post":"` + post + `","author":"` + a + `","body":"hello"}`, a, 429, []string{"message"}, nil},
		{"votes burst", "POST", "votes/records", `{"post":"000000000000011","user":"` + a + `"}`, a, 429, []string{"message"}, nil},
		{"anonymous post", "POST", "posts/records", `{"title":"hello","author":"` + a + `"}`, "", 400, []string{"message"}, nil},
		{"spoof author", "POST", "posts/records", `{"title":"hello","author":"` + b + `"}`, a, 400, []string{"message"}, nil},
		{"comment spoof", "POST", "comments/records", `{"post":"` + post + `","author":"` + b + `","body":"hello"}`, a, 400, []string{"message"}, nil},
		{"comment other delete", "DELETE", "comments/records/ccccccccccccccc", "", b, 404, []string{"message"}, nil},
		{"vote spoof", "POST", "votes/records", `{"post":"` + other + `","user":"` + b + `"}`, a, 400, []string{"message"}, nil},
		{"vote other delete", "DELETE", "votes/records/" + vote, "", b, 404, []string{"message"}, nil},
		{"maximum form length", "POST", "posts/records", `{"title":"hello","author":"` + a + `","form":"ABCDEFGHIJKL"}`, a, 200, []string{`"form":"ABCDEFGHIJKL"`}, nil},
		{"form too long", "POST", "posts/records", `{"title":"hello","author":"` + a + `","form":"ABCDEFGHIJKLM"}`, a, 400, []string{"message"}, nil},
		{"other delete", "DELETE", "posts/records/" + post, "", b, 404, []string{"message"}, nil},
		{"owner patch", "PATCH", "posts/records/" + post, `{"title":"changed"}`, a, 403, []string{"message"}, nil},
		{"duplicate vote", "POST", "votes/records", `{"post":"` + post + `","user":"` + a + `"}`, a, 400, []string{"message"}, nil},
		{"undo vote", "DELETE", "votes/records/" + vote, "", a, 204, nil, []string{vote}},
		{"users private", "GET", "users/records", "", "", 200, []string{`"totalItems":0`}, nil},
		{"member list users", "GET", "users/records", "", a, 200, []string{`"totalItems":1`, `"name":"Alice"`}, nil},
		{"admin list users", "GET", "users/records", "", admin, 200, []string{`"totalItems":3`, `"name":"Alice"`, `"name":"Bob"`}, nil},
		{"admin delete post", "DELETE", "posts/records/" + post, "", admin, 204, nil, []string{post, vote, "wwwwwwwwwwwwwww", "000000000000001", "000000000000002", "000000000000003"}},
		{"admin delete comment", "DELETE", "comments/records/ccccccccccccccc", "", admin, 204, nil, []string{"ccccccccccccccc"}},
		{"admin patch other user", "PATCH", "users/records/" + a, `{"name":"changed"}`, admin, 404, []string{"message"}, nil},
		{"admin delete other user", "DELETE", "users/records/" + a, "", admin, 404, []string{"message"}, nil},
		{"role injection create", "POST", "users/records", `{"email":"new@example.com","password":"password123","passwordConfirm":"password123","role":"admin"}`, "", 400, []string{"message"}, nil},
		{"role injection patch", "PATCH", "users/records/" + a, `{"role":"admin"}`, a, 404, []string{"message"}, nil},
		{"reserved name create", "POST", "users/records", `{"email":"new@example.com","password":"password123","passwordConfirm":"password123","name":"Admin helper"}`, "", 400, []string{`"name":`, `"message":"That name is reserved."`}, nil},
		{"reserved name patch", "PATCH", "users/records/" + a, `{"name":"the ＡＤ\u200bMIN helper"}`, a, 400, []string{`"name":`, `"message":"That name is reserved."`}, nil},
		{"admin self name", "PATCH", "users/records/" + admin, `{"name":"Admin team"}`, admin, 200, []string{`"name":"Admin team"`}, nil},
		{"grandfathered name", "PATCH", "users/records/" + a, `{"emailVisibility":true}`, a, 200, []string{`"emailVisibility":true`, `"name":"former ADMIN"`}, nil},
		{"votes private", "GET", "votes/records", "", "", 200, []string{`"totalItems":0`}, nil},
		{"agent usage list locked", "GET", "agent_usage/records", "", a, 403, []string{"message"}, nil},
		{"agent usage view locked", "GET", "agent_usage/records/uuuuuuuuuuuuuuu", "", a, 403, []string{"message"}, nil},
		{"agent usage create locked", "POST", "agent_usage/records", `{"user":"` + a + `","day":"2025-01-01"}`, a, 403, []string{"message"}, nil},
		{"agent usage update locked", "PATCH", "agent_usage/records/uuuuuuuuuuuuuuu", `{"input_tokens":0}`, a, 403, []string{"message"}, nil},
		{"agent usage delete locked", "DELETE", "agent_usage/records/uuuuuuuuuuuuuuu", "", a, 403, []string{"message"}, nil},
		{"cascade user", "DELETE", "users/records/" + a, "", a, 204, nil, []string{a, "uuuuuuuuuuuuuuu", post, vote, "000000000000001", "000000000000002", "000000000000003", "ccccccccccccccc", "xxxxxxxxxxxxxxx", "wwwwwwwwwwwwwww"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			headers := map[string]string{"Content-Type": "application/json"}
			var privateEmails []string
			for id, email := range map[string]string{a: "alice@example.com", b: "bob@example.com", admin: "admin@example.com"} {
				if id != tc.actor {
					privateEmails = append(privateEmails, email)
				}
			}
			scenario := tests.ApiScenario{Method: tc.method, URL: "/api/collections/" + tc.path, Body: strings.NewReader(tc.body), Headers: headers, ExpectedStatus: tc.status, ExpectedContent: tc.content, NotExpectedContent: privateEmails,
				TestAppFactory: func(tb testing.TB) *tests.TestApp {
					app, err := tests.NewTestApp(tb.TempDir())
					if err != nil {
						tb.Fatal(err)
					}
					accounts.Register(app)
					makeRecord := func(collection, id string, values map[string]any) *core.Record {
						c, err := app.FindCollectionByNameOrId(collection)
						if err != nil {
							tb.Fatal(err)
						}
						r := core.NewRecord(c)
						r.Id = id
						for k, v := range values {
							r.Set(k, v)
						}
						if err := app.Save(r); err != nil {
							tb.Fatalf("seed %s: %v", collection, err)
						}
						return r
					}
					ua := makeRecord("users", a, map[string]any{"email": "alice@example.com", "password": "password123", "name": "Alice"})
					makeRecord("users", b, map[string]any{"email": "bob@example.com", "password": "password123", "name": "Bob"})
					makeRecord("users", admin, map[string]any{"email": "admin@example.com", "password": "password123", "name": "admin", "role": "admin"})
					if tc.name == "grandfathered name" {
						ua.Set("name", "former ADMIN")
						if err := app.SaveNoValidate(ua); err != nil {
							tb.Fatal(err)
						}
					}
					makeRecord("agent_usage", "uuuuuuuuuuuuuuu", map[string]any{"user": a, "day": "2025-01-01", "input_tokens": 100})
					makeRecord("posts", post, map[string]any{"title": "First", "author": a})
					makeRecord("posts", other, map[string]any{"title": "Other", "author": b})
					makeRecord("votes", vote, map[string]any{"post": post, "user": a})
					makeRecord("votes", "wwwwwwwwwwwwwww", map[string]any{"post": post, "user": b})
					for i := 0; i < 3; i++ {
						makeRecord("comments", fmt.Sprintf("%015d", i+1), map[string]any{"post": post, "author": a, "body": "hello"})
					}
					makeRecord("comments", "ccccccccccccccc", map[string]any{"post": other, "author": a, "body": "elsewhere"})
					makeRecord("votes", "xxxxxxxxxxxxxxx", map[string]any{"post": other, "user": a})
					if tc.name == "votes burst" {
						for i := 1; i <= 11; i++ {
							makeRecord("posts", fmt.Sprintf("%015d", i), map[string]any{"title": "vote target", "author": b})
						}
					}
					if tc.actor != "" {
						user, err := app.FindRecordById("users", tc.actor)
						if err != nil {
							tb.Fatal(err)
						}
						token, err := user.NewAuthToken()
						if err != nil {
							tb.Fatal(err)
						}
						headers["Authorization"] = token
					}
					return app
				},
				BeforeTestFunc: func(tb testing.TB, _ *tests.TestApp, e *core.ServeEvent) {
					if !strings.HasSuffix(tc.name, " burst") {
						return
					}
					mux, err := e.Router.BuildMux()
					if err != nil {
						tb.Fatal(err)
					}
					for i := 0; i < 10; i++ {
						body := tc.body
						switch tc.name {
						case "signup burst":
							body = fmt.Sprintf(`{"email":"burst%d@example.com","password":"password123","passwordConfirm":"password123"}`, i)
						case "votes burst":
							body = fmt.Sprintf(`{"post":"%015d","user":"%s"}`, i+1, a)
						}
						req := httptest.NewRequest(tc.method, "/api/collections/"+tc.path, strings.NewReader(body))
						req.Header.Set("Content-Type", "application/json")
						req.Header.Set("Authorization", headers["Authorization"])
						rec := httptest.NewRecorder()
						mux.ServeHTTP(rec, req)
						if rec.Code != http.StatusOK {
							tb.Fatalf("burst request %d: status %d: %s", i+1, rec.Code, rec.Body.String())
						}
					}
				},
				AfterTestFunc: func(tb testing.TB, app *tests.TestApp, _ *http.Response) {
					for _, item := range []struct{ collection, id string }{
						{"users", a}, {"users", b}, {"users", admin},
						{"agent_usage", "uuuuuuuuuuuuuuu"}, {"posts", post}, {"posts", other},
						{"comments", "000000000000001"}, {"comments", "000000000000002"}, {"comments", "000000000000003"}, {"comments", "ccccccccccccccc"},
						{"votes", vote}, {"votes", "xxxxxxxxxxxxxxx"}, {"votes", "wwwwwwwwwwwwwww"},
					} {
						_, err := app.FindRecordById(item.collection, item.id)
						exists := !slices.Contains(tc.gone, item.id)
						if (err == nil) != exists {
							tb.Errorf("%s %s exists=%v, err=%v", item.collection, item.id, exists, err)
						}
					}
				},
			}
			scenario.Test(t)
		})
	}
	t.Run("agent rate rule", func(t *testing.T) {
		scenario := tests.ApiScenario{
			Method: "POST", URL: "/api/x/agent/ask", ExpectedStatus: 429,
			ExpectedContent: []string{`"message":"Too Many Requests."`},
			TestAppFactory: func(tb testing.TB) *tests.TestApp {
				app, err := tests.NewTestApp(tb.TempDir())
				if err != nil {
					tb.Fatal(err)
				}
				return app
			},
			BeforeTestFunc: func(tb testing.TB, app *tests.TestApp, e *core.ServeEvent) {
				// Put the exact endpoint rule ahead of any broader first-match rule.
				rule, ok := app.Settings().RateLimits.FindRateLimitRule([]string{"POST /api/x/agent/ask", "/api/"})
				if !ok || rule.Label != "POST /api/x/agent/ask" || len(app.Settings().TrustedProxy.Headers) != 1 || app.Settings().TrustedProxy.Headers[0] != "CF-Connecting-IP" {
					tb.Fatal("agent rule or trusted proxy settings")
				}
				e.Router.POST("/api/x/agent/ask", func(r *core.RequestEvent) error { return r.JSON(200, map[string]string{"ok": "yes"}) })
				mux, err := e.Router.BuildMux()
				if err != nil {
					tb.Fatal(err)
				}
				for i := 0; i < 3; i++ {
					res := httptest.NewRecorder()
					mux.ServeHTTP(res, httptest.NewRequest("POST", "/api/x/agent/ask", nil))
					if res.Code != 200 {
						tb.Fatalf("agent request %d: %d %s", i, res.Code, res.Body.String())
					}
				}
			},
		}
		scenario.Test(t)
	})
}

func TestAdminBootstrap(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	if err := downAdmin(app); err != nil {
		t.Fatal(err)
	}
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	if users.Fields.GetByName("role") != nil || *users.ListRule != "id = @request.auth.id" {
		t.Fatal("downAdmin left the role field or admin list rule")
	}
	var members []*core.Record
	for i, name := range []string{"admin", " ADMIN "} {
		r := core.NewRecord(users)
		r.SetEmail(fmt.Sprintf("admin%d@example.com", i))
		r.SetPassword("password123")
		r.Set("name", name)
		if err := app.Save(r); err != nil {
			t.Fatal(err)
		}
		members = append(members, r)
	}
	if err := upAdmin(app); err != nil {
		t.Fatal(err)
	}
	for _, member := range members {
		r, err := app.FindRecordById("users", member.Id)
		if err != nil {
			t.Fatal(err)
		}
		if r.GetString("role") != "" {
			t.Fatalf("ambiguous admin name promoted %s", r.Id)
		}
	}
	if err := app.Delete(members[0]); err != nil {
		t.Fatal(err)
	}
	if err := downAdmin(app); err != nil {
		t.Fatal(err)
	}
	if err := upAdmin(app); err != nil {
		t.Fatal(err)
	}
	r, err := app.FindRecordById("users", members[1].Id)
	if err != nil {
		t.Fatal(err)
	}
	if r.GetString("role") != "admin" {
		t.Fatal("unique normalized admin name was not promoted")
	}
}
