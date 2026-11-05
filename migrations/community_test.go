package migrations

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tests"
)

func TestCommunityRules(t *testing.T) {
	const a = "aaaaaaaaaaaaaaa"
	const b = "bbbbbbbbbbbbbbb"
	const post = "ppppppppppppppp"
	const other = "qqqqqqqqqqqqqqq"
	const vote = "vvvvvvvvvvvvvvv"
	cases := []struct {
		name, method, path, body, actor string
		status                          int
		content                         []string
		cascade                         bool
	}{
		{"public feed", "GET", "post_feed/records", "", "", 200, []string{`"votes":2`, `"comments":3`, `"author_name":"Alice"`}, false},
		{"public comment feed", "GET", "comment_feed/records", "", "", 200, []string{`"author_name":"Alice"`, `"body":"hello"`}, false},
		{"signup burst", "POST", "users/records", `{"email":"burst10@example.com","password":"password123","passwordConfirm":"password123"}`, "", 429, []string{"message"}, false},
		{"posts burst", "POST", "posts/records", `{"title":"hello","author":"` + a + `"}`, a, 429, []string{"message"}, false},
		{"comments burst", "POST", "comments/records", `{"post":"` + post + `","author":"` + a + `","body":"hello"}`, a, 429, []string{"message"}, false},
		{"votes burst", "POST", "votes/records", `{"post":"000000000000011","user":"` + a + `"}`, a, 429, []string{"message"}, false},
		{"anonymous post", "POST", "posts/records", `{"title":"hello","author":"` + a + `"}`, "", 400, []string{"message"}, false},
		{"spoof author", "POST", "posts/records", `{"title":"hello","author":"` + b + `"}`, a, 400, []string{"message"}, false},
		{"comment spoof", "POST", "comments/records", `{"post":"` + post + `","author":"` + b + `","body":"hello"}`, a, 400, []string{"message"}, false},
		{"comment other delete", "DELETE", "comments/records/ccccccccccccccc", "", b, 404, []string{"message"}, false},
		{"vote spoof", "POST", "votes/records", `{"post":"` + other + `","user":"` + b + `"}`, a, 400, []string{"message"}, false},
		{"vote other delete", "DELETE", "votes/records/" + vote, "", b, 404, []string{"message"}, false},
		{"maximum form length", "POST", "posts/records", `{"title":"hello","author":"` + a + `","form":"ABCDEFGHIJKL"}`, a, 200, []string{`"form":"ABCDEFGHIJKL"`}, false},
		{"form too long", "POST", "posts/records", `{"title":"hello","author":"` + a + `","form":"ABCDEFGHIJKLM"}`, a, 400, []string{"message"}, false},
		{"other delete", "DELETE", "posts/records/" + post, "", b, 404, []string{"message"}, false},
		{"owner patch", "PATCH", "posts/records/" + post, `{"title":"changed"}`, a, 403, []string{"message"}, false},
		{"duplicate vote", "POST", "votes/records", `{"post":"` + post + `","user":"` + a + `"}`, a, 400, []string{"message"}, false},
		{"undo vote", "DELETE", "votes/records/" + vote, "", a, 204, nil, false},
		{"users private", "GET", "users/records", "", "", 200, []string{`"totalItems":0`}, false},
		{"votes private", "GET", "votes/records", "", "", 200, []string{`"totalItems":0`}, false},
		{"cascade user", "DELETE", "users/records/" + a, "", a, 204, nil, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			headers := map[string]string{"Content-Type": "application/json"}
			scenario := tests.ApiScenario{Method: tc.method, URL: "/api/collections/" + tc.path, Body: strings.NewReader(tc.body), Headers: headers, ExpectedStatus: tc.status, ExpectedContent: tc.content, NotExpectedContent: []string{"alice@example.com", "bob@example.com"},
				TestAppFactory: func(tb testing.TB) *tests.TestApp {
					app, err := tests.NewTestApp(tb.TempDir())
					if err != nil {
						tb.Fatal(err)
					}
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
					ub := makeRecord("users", b, map[string]any{"email": "bob@example.com", "password": "password123", "name": "Bob"})
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
						user := ua
						if tc.actor == b {
							user = ub
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
					if !tc.cascade {
						return
					}
					for _, item := range []struct {
						collection, id string
						exists         bool
					}{{"posts", post, false}, {"posts", other, true}, {"comments", "ccccccccccccccc", false}, {"votes", "xxxxxxxxxxxxxxx", false}, {"votes", "wwwwwwwwwwwwwww", false}} {
						_, err := app.FindRecordById(item.collection, item.id)
						if (err == nil) != item.exists {
							tb.Errorf("%s %s exists=%v, err=%v", item.collection, item.id, item.exists, err)
						}
					}
				},
			}
			scenario.Test(t)
		})
	}
}
