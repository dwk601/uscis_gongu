package uscis

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tests"
	_ "gongu/migrations"
)

func TestAgentContract(t *testing.T) {
	fixture, _ := insightsFixture(t)
	if fixture == nil {
		return
	}
	// The only fake is the remote provider. Requests still cross authentication,
	// PocketBase transactions, the official SDK, sqlc and read-only PostgreSQL.
	type step struct {
		name, args                     string
		status                         int
		check                          func(map[string]any)
		argsFrom                       func(map[string]any) string
		noUsage                        bool
		toolsFrom                      func(map[string]any) []any
		block                          <-chan struct{}
		untilCancel                    bool
		promptTokens, completionTokens int
	}
	type harness struct {
		app    *tests.TestApp
		mux    http.Handler
		tokens []string
		calls  *atomic.Int32
	}
	tool := func(name, args string) map[string]any {
		return map[string]any{"id": "call_1", "type": "function", "function": map[string]any{"name": name, "arguments": args}}
	}
	newHarness := func(t *testing.T, steps []step) *harness {
		t.Helper()
		count := &atomic.Int32{}
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var v map[string]any
			if err := json.NewDecoder(io.LimitReader(r.Body, 131072)).Decode(&v); err != nil {
				t.Errorf("provider body: %v", err)
			}
			n := int(count.Add(1)) - 1
			if n >= len(steps) {
				t.Errorf("extra provider call %d", n+1)
				w.WriteHeader(500)
				return
			}
			s := steps[n]
			if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer fixture-key" {
				t.Errorf("provider routing: %s", r.URL.Path)
			}
			if s.check != nil {
				s.check(v)
			}
			if s.untilCancel {
				<-r.Context().Done()
				return
			}
			if s.block != nil {
				select {
				case <-s.block:
				case <-r.Context().Done():
					return
				}
			}
			prompt, completion := s.promptTokens, s.completionTokens
			if prompt == 0 {
				prompt = 13
			}
			if completion == 0 {
				completion = 7
			}
			w.Header().Set("Content-Type", "application/json")
			if s.status != 0 {
				w.WriteHeader(s.status)
				payload := map[string]any{"error": map[string]any{"message": "secret provider detail", "type": "invalid_request_error"}, "usage": map[string]int{"prompt_tokens": 13, "completion_tokens": 7}}
				if s.noUsage {
					delete(payload, "usage")
				}
				json.NewEncoder(w).Encode(payload)
				return
			}
			if s.argsFrom != nil {
				s.args = s.argsFrom(v)
			}
			calls := []any{tool(s.name, s.args)}
			if s.toolsFrom != nil {
				calls = s.toolsFrom(v)
			}
			json.NewEncoder(w).Encode(map[string]any{"id": "completion", "object": "chat.completion", "model": "fixture-model", "choices": []any{map[string]any{"index": 0, "finish_reason": "tool_calls", "message": map[string]any{"role": "assistant", "content": "Never render this raw text 9999", "tool_calls": calls}}}, "usage": map[string]int{"prompt_tokens": prompt, "completion_tokens": completion}})
		}))
		t.Cleanup(server.Close)
		t.Setenv("AGENT_BASE_URL", server.URL+"/v1/")
		t.Setenv("AGENT_API_KEY", "fixture-key")
		t.Setenv("AGENT_MODEL", "fixture-model")
		t.Setenv("AGENT_REASONING_EFFORT", "low")
		t.Setenv("AGENT_MAX_QUESTION_TOKENS", "")
		t.Setenv("AGENT_MAX_QUESTION_OUTPUT_TOKENS", "2048")
		t.Setenv("AGENT_MAX_OUTPUT_TOKENS", "1024")
		t.Setenv("AGENT_DAILY_TOKENS", "100000")
		dir := t.TempDir()
		app, err := tests.NewTestApp(dir)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(app.Cleanup)
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			t.Fatal(err)
		}
		tokens := []string{}
		for i := 0; i < 2; i++ {
			user := core.NewRecord(users)
			user.Set("email", fmt.Sprintf("agent%d@example.com", i))
			user.SetPassword("password123")
			if err := app.Save(user); err != nil {
				t.Fatal(err)
			}
			token, err := user.NewAuthToken()
			if err != nil {
				t.Fatal(err)
			}
			tokens = append(tokens, token)
		}
		Register(app)
		router, err := apis.NewRouter(app)
		if err != nil {
			t.Fatal(err)
		}
		var mux http.Handler
		if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(e *core.ServeEvent) error { var err error; mux, err = e.Router.BuildMux(); return err }); err != nil {
			t.Fatal(err)
		}
		return &harness{app: app, mux: mux, tokens: tokens, calls: count}
	}
	var ip int
	ask := func(t *testing.T, h *harness, body, token string, status int) map[string]any {
		t.Helper()
		ip++
		req := httptest.NewRequest("POST", "/api/x/agent/ask", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", token)
		req.RemoteAddr = fmt.Sprintf("127.0.0.%d:1234", ip)
		res := httptest.NewRecorder()
		h.mux.ServeHTTP(res, req)
		if res.Code != status || res.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("status/cache %d %s: %s", res.Code, res.Header().Get("Cache-Control"), res.Body.String())
		}
		var v map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &v); err != nil {
			t.Fatal(err)
		}
		if status == 503 && !reflect.DeepEqual(v, map[string]any{"status": float64(503), "message": "Ask gongu is unavailable. Please try again later.", "data": map[string]any{}}) {
			t.Fatalf("fixed error: %s", res.Body.String())
		}
		return v
	}
	results := func(v map[string]any) []map[string]any {
		out := []map[string]any{}
		total := 0
		for _, raw := range v["messages"].([]any) {
			msg := raw.(map[string]any)
			if msg["role"] != "tool" {
				continue
			}
			text := msg["content"].(string)
			total += len(text)
			if total > 3000 {
				t.Errorf("combined tool result cap: %d", total)
			}
			if len([]byte(text)) > 1200 {
				t.Errorf("tool result exceeds cap: %d", len(text))
			}
			var result map[string]any
			if err := json.Unmarshal([]byte(text), &result); err != nil {
				t.Error(err)
			}
			out = append(out, result)
		}
		return out
	}
	const formsArgs = `{"form":"I-765"}`
	const refusal = `{"kind":"refusal","blocks":[{"type":"paragraph","text":"I can only answer questions about USCIS case data on gongu."}]}`
	const clarify = `{"kind":"clarification","blocks":[{"type":"paragraph","text":"Which form and series do you mean?"}]}`
	const badStyle = `{"kind":"clarification","blocks":[{"type":"paragraph","text":"Which form—please clarify?"}]}`

	t.Run("grounded answer and input boundary", func(t *testing.T) {
		h := newHarness(t, []step{
			{name: "forms", args: formsArgs, promptTokens: 4000, completionTokens: 128},
			{promptTokens: 4000, completionTokens: 256, toolsFrom: func(v map[string]any) []any {
				options := results(v)[0]["items"].([]any)
				if len(options) != 2 {
					t.Errorf("series options: %#v", options)
				}
				selected := ""
				labels := map[string]bool{}
				for _, raw := range options {
					row := raw.(map[string]any)["row"].(map[string]any)
					labels[row["label"].(string)] = true
					if row["period"] != "FY 2025 quarter 4" {
						t.Errorf("option period: %#v", row)
					}
					if row["label"] == "All other cases" {
						selected = row["series"].(string)
					}
				}
				if !labels["Asylum"] || !labels["All other cases"] || selected == "" {
					t.Errorf("series discovery: %#v", options)
				}
				estimate := tool("estimate_date", fmt.Sprintf(`{"form":"I-765","series":%q,"filingDate":"2024-01-01"}`, selected))
				estimate["id"] = "call_2"
				return []any{tool("forms", fmt.Sprintf(`{"form":"I-765","series":%q}`, selected)), estimate}
			}},
			{name: "answer", promptTokens: 4000, completionTokens: 512, argsFrom: func(v map[string]any) string {
				projections := results(v)
				r := projections[1]
				if r["truncated"] != true || r["omitted"].(float64) < 1 || int(r["omitted"].(float64))+len(r["items"].([]any)) != 4 {
					t.Errorf("bounded projection: %#v", r)
				}
				item := r["items"].([]any)[0].(map[string]any)
				row := item["row"].(map[string]any)
				if row["received"] != float64(123) || row["approved"] != nil || row["processingMonths"] != nil || row["label"] != "Work permit EAD, All other cases" {
					t.Errorf("official projection: %#v", item)
				}
				factRefs := item["factRefs"].(map[string]any)
				estimate := projections[2]["items"].([]any)[0].(map[string]any)
				est := estimate["estimate"].(map[string]any)
				if est["medianMonths"] != 2.5 || est["estimatedDate"] != "2024-03-17" || est["period"] != "FY 2025 quarter 2" {
					t.Errorf("estimate projection: %#v", estimate)
				}
				paragraph := fmt.Sprintf("I-765 reports {{%s}} received. Approval data is {{%s}}. The estimate is {{%s}}.", factRefs["received"], factRefs["approved"], estimate["estimateRef"])
				return fmt.Sprintf(`{"kind":"answer","blocks":[{"type":"paragraph","text":%q},{"type":"stat","factRef":%q},{"type":"table","rowRefs":[%q],"columns":["label","received","approved","period"]},{"type":"date_estimate","estimateRef":%q}]}`, paragraph, factRefs["approved"], item["rowRef"], estimate["estimateRef"])
			}},
		})
		ask(t, h, `{"question":"hello"}`, "", 401)
		for _, body := range []string{`{}`, `{"question":" "}`, `{"question":42}`, `{"Question":"hi"}`, `{"question":null}`, `[]`, `{"question":"hi","user":"spoof"}`, `{"question":"hi"} {}`, `{"question":"a","question":"b"}`, `{"question":"` + strings.Repeat("a", 2001) + `"}`, `{"question":"` + strings.Repeat(`\u4e00`, 2000) + `"}`} {
			ask(t, h, body, h.tokens[0], 400)
		}
		v := ask(t, h, `{"question":"  Compare the official data and estimate.  "}`, h.tokens[0], 200)
		blocks := v["blocks"].([]any)
		stat := blocks[1].(map[string]any)
		estimate := blocks[3].(map[string]any)
		if blocks[0].(map[string]any)["text"] != "I-765 reports 123 cases received. Approval data is not available. The estimate is 2024-03-17." {
			t.Fatalf("resolved prose: %#v", blocks[0])
		}
		if v["kind"] != "answer" || len(blocks) != 4 || stat["value"] != nil || stat["label"] != "Work permit EAD, All other cases, Approved cases" || stat["unit"] != "cases" || estimate["medianMonths"] != 2.5 || estimate["estimatedDate"] != "2024-03-17" {
			t.Fatalf("grounded blocks: %#v", v)
		}
		sources := v["sources"].([]any)
		if len(sources) != 1 || sources[0].(map[string]any)["href"] != "/trends?form=I-765" {
			t.Fatalf("sources: %#v", sources)
		}
		budget := v["budget"].(map[string]any)
		if budget["remaining"] != float64(87104) || budget["questionLimit"] != float64(16000) || budget["limit"] != float64(100000) {
			t.Fatalf("budget: %#v", budget)
		}
		reset, err := time.Parse(time.RFC3339, budget["resetsAt"].(string))
		if err != nil || reset.Hour() != 0 || !reset.After(time.Now()) {
			t.Fatalf("reset: %#v", budget)
		}
		if h.calls.Load() != 3 {
			t.Fatal("provider call count")
		}
		for _, token := range []string{"", h.tokens[0]} {
			for i := 0; i < 4; i++ {
				req := httptest.NewRequest("POST", "/api/x/agent/ask", strings.NewReader(`{}`))
				req.Header.Set("Authorization", token)
				req.RemoteAddr = "192.0.2.1:1234"
				res := httptest.NewRecorder()
				h.mux.ServeHTTP(res, req)
				want := 401
				if token != "" {
					want = 400
					if i == 3 {
						want = 429
					}
				}
				if res.Code != want || res.Header().Get("Cache-Control") != "no-store" {
					t.Fatalf("auth/rate ordering: %d %s", res.Code, res.Body.String())
				}
			}
		}
		// The other readers preserve cohort counts, null percentiles and each
		// bulletin status. These expectations do not use production helpers.
		for _, tc := range []struct {
			name, args, answer string
			check              func(map[string]any)
		}{
			{"forms", `{"form":"I-131","query":"NACARA"}`, `{"kind":"clarification","blocks":[{"type":"paragraph","text":"Do you mean {{r1.label}}?"}]}`, func(item map[string]any) {
				row := item["row"].(map[string]any)
				if row["label"] != "A to B NACARA, urgent, now" || row["period"] != "FY 2025 quarter 4" {
					t.Errorf("normalized option: %#v", row)
				}
			}},
			{"forms", `{"form":"I-129F"}`, `{"kind":"answer","blocks":[{"type":"table","rowRefs":["r1"],"columns":["label"]}]}`, func(item map[string]any) {
				if item["row"].(map[string]any)["label"] != "Fiancé or fiancée or spouse petition, Petition for Alien Fiancé or fiancée" {
					t.Errorf("normalized fiance label: %#v", item)
				}
			}},
			{"forms", `{"query":"fiancé"}`, `{"kind":"answer","blocks":[{"type":"paragraph","text":"The catalog calls this {{r1.name}}."}]}`, func(item map[string]any) {
				row := item["row"].(map[string]any)
				if row["form"] != "I-129F" || row["name"] != "Fiancé or fiancée or spouse petition" {
					t.Errorf("filtered catalog: %#v", row)
				}
			}},
			{"forms", `{"offset":2}`, `{"kind":"answer","blocks":[{"type":"paragraph","text":"The catalog calls this {{r1.name}}."}]}`, func(item map[string]any) {
				if item["row"].(map[string]any)["form"] != "I-131" {
					t.Errorf("catalog offset: %#v", item)
				}
			}},
			{"community_timelines", `{"form":"I-765","visaType":"K1","filingYear":2024}`, `{"kind":"answer","blocks":[{"type":"table","rowRefs":["r1"],"columns":["sampleSize","completed","p50","p90"]}]}`, func(item map[string]any) {
				row := item["row"].(map[string]any)
				if row["sampleSize"] != float64(40) || row["completed"] != float64(31) || row["p50"] != float64(45) || row["p90"] != nil || row["meaning"] != "Application filed to work permit approved. Percentiles describe completed reports only." {
					t.Errorf("community fixture: %#v", row)
				}
			}},
			{"bulletin", `{"category":"EB2","country":"INDIA","chart":"final_action"}`, `{"kind":"answer","blocks":[{"type":"bulletin_cutoff","cutoffRef":"c1"}]}`, func(item map[string]any) {
				cutoff := item["cutoff"].(map[string]any)
				if cutoff["status"] != "date" || cutoff["cutoff"] != "2012-10-15" || cutoff["month"] != "2025-02" || cutoff["country"] != "INDIA" {
					t.Errorf("date cutoff: %#v", cutoff)
				}
			}},
			{"bulletin", `{"category":"EB2","country":"ALL","chart":"final_action"}`, `{"kind":"answer","blocks":[{"type":"bulletin_cutoff","cutoffRef":"c1"}]}`, func(item map[string]any) {
				cutoff := item["cutoff"].(map[string]any)
				if cutoff["status"] != "current" || cutoff["cutoff"] != nil {
					t.Errorf("current cutoff: %#v", cutoff)
				}
			}},
			{"bulletin", `{"category":"EB2","country":"INDIA","chart":"dates_for_filing","month":"2025-02"}`, `{"kind":"answer","blocks":[{"type":"bulletin_cutoff","cutoffRef":"c1"}]}`, func(item map[string]any) {
				cutoff := item["cutoff"].(map[string]any)
				if cutoff["status"] != "unavailable" || cutoff["cutoff"] != nil {
					t.Errorf("unavailable cutoff: %#v", cutoff)
				}
			}},
		} {
			h := newHarness(t, []step{{name: tc.name, args: tc.args}, {name: "answer", argsFrom: func(v map[string]any) string {
				r := results(v)[0]
				item := r["items"].([]any)[0].(map[string]any)
				tc.check(item)
				if ref, ok := item["rowRef"].(string); ok {
					return strings.ReplaceAll(tc.answer, "r1", ref)
				}
				return strings.ReplaceAll(tc.answer, "c1", item["cutoffRef"].(string))
			}}})
			v := ask(t, h, `{"question":"Show the selected data."}`, h.tokens[0], 200)
			if len(v["blocks"].([]any)) != 1 || len(v["sources"].([]any)) != 1 {
				t.Fatalf("reader blocks/sources: %#v", v)
			}
			if tc.args == `{"form":"I-131","query":"NACARA"}` && v["blocks"].([]any)[0].(map[string]any)["text"] != "Do you mean A to B NACARA, urgent, now?" {
				t.Fatalf("normalized explanation: %#v", v)
			}
			if tc.name == "community_timelines" {
				source := v["sources"].([]any)[0].(map[string]any)
				if source["label"] != "VisaJourney self-reported timelines, I-765, K1, Application filed to work permit approved" || source["period"] != "Filing cohort 2024" {
					t.Fatalf("normalized source: %#v", source)
				}
			}
		}
	})

	t.Run("invalid selections cannot dispatch readers or display values", func(t *testing.T) {
		// A real reader would block on these views. Invalid calls must fail before it.
		tx, err := fixture.Begin(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(context.Background())
		if _, err := tx.Exec(context.Background(), "LOCK TABLE public.uscis_form_quarter IN ACCESS EXCLUSIVE MODE"); err != nil {
			t.Fatal(err)
		}
		for _, s := range []step{
			{name: "forms", args: `{"form":"I-765","unknown":1}`},
			{name: "forms", args: `{"quarter":8}`},
			{name: "estimate_date", args: `{"form":"I-765","series":"x","filingDate":"2024-02-30"}`},
			{name: "execute_sql", args: `{"sql":"SELECT 9999"}`},
			{name: "answer", args: `{"kind":"answer","blocks":[{"type":"stat","factRef":"made-up"}]}`},
			{name: "answer", args: `{"kind":"answer","blocks":[{"type":"stat","factRef":"made-up","value":9999}]}`},
		} {
			steps := []step{s}
			if s.name == "answer" {
				steps = append(steps, s)
			}
			h := newHarness(t, steps)
			start := time.Now()
			ask(t, h, `{"question":"Tell me."}`, h.tokens[0], 503)
			if time.Since(start) > time.Second || int(h.calls.Load()) != len(steps) {
				t.Fatal("invalid selection dispatched a reader or retried")
			}
		}
	})

	t.Run("style repair and provider wire contract", func(t *testing.T) {
		for _, draft := range []struct{ first, second string }{
			{badStyle, clarify}, {badStyle, badStyle},
			{`{"kind":"clarification","blocks":[{"type":"paragraph","text":"There are 123 pending cases."}]}`, clarify},
			{`{"kind":"clarification","blocks":[{"type":"paragraph","text":"There are ½ pending cases."}]}`, clarify},
			{`{"kind":"clarification","blocks":[{"type":"paragraph","text":"There are ② pending cases."}]}`, clarify},
			{`{"kind":"clarification","blocks":[{"type":"paragraph","text":"There are Ⅳ pending cases."}]}`, clarify},
			{`{"kind":"clarification","blocks":[{"type":"paragraph","text":"Email help@example.com or visit https://example.com."}]}`, clarify},
			{`{"kind":"clarification","blocks":[{"type":"paragraph","text":"Which form--please clarify?"}]}`, clarify},
			{`{"kind":"clarification","blocks":[{"type":"paragraph","text":"Which form―please clarify?"}]}`, clarify},
			{`{"kind":"clarification","blocks":[{"type":"paragraph","text":"Which form‒please clarify?"}]}`, clarify},
			{`{"kind":"clarification","blocks":[{"type":"paragraph","text":"Which form−please clarify?"}]}`, clarify},
		} {
			second := draft.second
			h := newHarness(t, []step{
				{name: "answer", args: draft.first, check: func(v map[string]any) {
					toolsJSON, err := json.Marshal(v["tools"])
					if err != nil || len(toolsJSON) > 3000 {
						t.Errorf("tool schema byte cap: %d (%v)", len(toolsJSON), err)
					}
					allowed := map[string]bool{"model": true, "messages": true, "tools": true, "tool_choice": true, "max_completion_tokens": true, "reasoning_effort": true}
					for k := range v {
						if !allowed[k] {
							t.Errorf("forbidden request field %s", k)
						}
					}
					if v["max_completion_tokens"] != float64(1024) || v["tool_choice"] != "auto" || (second == clarify && v["reasoning_effort"] != "low") || (second == badStyle && v["reasoning_effort"] != nil) {
						t.Errorf("provider options: %#v", v)
					}
					if !strings.Contains(v["messages"].([]any)[0].(map[string]any)["content"].(string), "Patterns to detect and fix\nRule numbers are stable ids") {
						t.Error("style list missing")
					}
				}},
				{name: "answer", args: second, check: func(v map[string]any) {
					tools := v["tools"].([]any)
					if len(tools) != 1 || tools[0].(map[string]any)["function"].(map[string]any)["name"] != "answer" {
						t.Error("repair tools")
					}
					if !strings.Contains(v["messages"].([]any)[0].(map[string]any)["content"].(string), "Shorten or split dense sentences.") {
						t.Error("repair style list missing")
					}
				}},
			})
			status := 200
			if second == badStyle {
				t.Setenv("AGENT_REASONING_EFFORT", "")
				status = 503
			}
			ask(t, h, `{"question":"Which form?"}`, h.tokens[0], status)
			if h.calls.Load() != 2 {
				t.Fatal("repair count")
			}
		}
	})

	t.Run("reader and provider failures charge usage", func(t *testing.T) {
		for _, s := range []step{{name: "forms", args: formsArgs}, {status: 400}, {status: 400, noUsage: true}, {untilCancel: true}} {
			if s.status == 0 && !s.untilCancel {
				if _, err := fixture.Exec(context.Background(), "ALTER VIEW public.uscis_form_quarter RENAME TO saved_agent_forms"); err != nil {
					t.Fatal(err)
				}
			}
			h := newHarness(t, []step{s})
			status := 503
			if s.untilCancel {
				status = 504
			}
			question := "Show data."
			if s.noUsage {
				question = strings.Repeat("案", 2000)
			}
			v := ask(t, h, fmt.Sprintf(`{"question":%q}`, question), h.tokens[0], status)
			if s.untilCancel && v["message"] != "The answer took too long. Please try again." {
				t.Fatalf("deadline response: %#v", v)
			}
			rows, err := h.app.FindAllRecords("agent_usage")
			if err != nil || len(rows) != 1 || rows[0].GetInt("reserved_tokens") != 0 {
				t.Fatalf("charged failure: %v %v", rows, err)
			}
			if s.noUsage || s.untilCancel {
				if rows[0].GetInt("estimated_tokens") <= 1024 || rows[0].GetInt("input_tokens") != 0 || rows[0].GetInt("output_tokens") != 0 {
					t.Fatalf("missing usage charge: %v", rows[0])
				}
			} else if rows[0].GetInt("input_tokens") != 13 || rows[0].GetInt("output_tokens") != 7 || rows[0].GetInt("estimated_tokens") != 0 {
				t.Fatalf("reported usage charge: %v", rows[0])
			}
			// The question alone is 6000 UTF-8 bytes. Add the 1024 output cap
			// and the fixed style/tools estimate, not a ratio over the question.
			if s.noUsage && (rows[0].GetInt("estimated_tokens") < 8500 || rows[0].GetInt("estimated_tokens") > 10000) {
				t.Fatalf("variable bytes must be charged without a text ratio: %v", rows[0])
			}
			if h.calls.Load() != 1 {
				t.Fatal("failure retried")
			}
			if s.status == 0 && !s.untilCancel {
				if _, err := fixture.Exec(context.Background(), "ALTER VIEW public.saved_agent_forms RENAME TO uscis_form_quarter"); err != nil {
					t.Fatal(err)
				}
			}
		}
	})

	t.Run("budget isolation and persistence", func(t *testing.T) {
		h := newHarness(t, []step{{name: "answer", args: refusal}, {name: "answer", args: refusal}})
		t.Setenv("AGENT_DAILY_TOKENS", "16000")
		refused := ask(t, h, `{"question":"`+strings.Repeat("案", 2000)+`"}`, h.tokens[0], 200)
		if refused["kind"] != "refusal" || refused["blocks"].([]any)[0].(map[string]any)["text"] != "I can only answer questions about USCIS case data on gongu." {
			t.Fatalf("exact refusal: %#v", refused)
		}
		v := ask(t, h, `{"question":"Weather?"}`, h.tokens[0], 429)
		data := v["data"].(map[string]any)
		if data["reason"].(map[string]any)["code"] != "daily_budget_exhausted" || data["remaining"] != float64(15980) || h.calls.Load() != 1 {
			t.Fatalf("exhaustion: %#v", v)
		}
		ask(t, h, `{"question":"Weather?"}`, h.tokens[1], 200)
		if h.calls.Load() != 2 {
			t.Fatal("per-user isolation")
		}
		// Reopen the same SQLite files. Reservations and charges are not in memory.
		if err := h.app.ClearBootstrap(); err != nil {
			t.Fatal(err)
		}
		reopened := core.NewBaseApp(core.BaseAppConfig{DataDir: h.app.DataDir(), EncryptionEnv: "pb_test_env"})
		if err := reopened.Bootstrap(); err != nil {
			t.Fatal(err)
		}
		defer reopened.ClearBootstrap()
		rows, err := reopened.FindAllRecords("agent_usage")
		if err != nil || len(rows) != 2 {
			t.Fatalf("reopen: %v %v", rows, err)
		}
		for _, r := range rows {
			if r.GetInt("input_tokens") != 13 || r.GetInt("output_tokens") != 7 || r.GetInt("reserved_tokens") != 0 {
				t.Fatalf("persisted usage: %v", r)
			}
		}
		tooSmall := newHarness(t, nil)
		t.Setenv("AGENT_MAX_QUESTION_TOKENS", "1")
		ask(t, tooSmall, `{"question":"A valid question."}`, tooSmall.tokens[0], 503)
		t.Setenv("AGENT_MAX_QUESTION_TOKENS", "5000")
		invalid := ask(t, tooSmall, `{"question":"`+strings.Repeat("案", 2000)+`"}`, tooSmall.tokens[0], 400)
		if invalid["message"] != "Invalid question." || tooSmall.calls.Load() != 0 {
			t.Fatalf("input allocation: %#v", invalid)
		}

		release := make(chan struct{})
		released := false
		defer func() {
			if !released {
				close(release)
			}
		}()
		blocked := newHarness(t, []step{
			{name: "answer", args: refusal, block: release}, {name: "answer", args: refusal, block: release},
			{name: "answer", args: refusal, block: release}, {name: "answer", args: refusal, block: release},
		})
		responses := make(chan *httptest.ResponseRecorder, 4)
		for i := 0; i < 4; i++ {
			go func(i int) {
				req := httptest.NewRequest("POST", "/api/x/agent/ask", strings.NewReader(`{"question":"Weather?"}`))
				req.Header.Set("Authorization", blocked.tokens[0])
				req.RemoteAddr = fmt.Sprintf("198.51.100.%d:1234", i+1)
				res := httptest.NewRecorder()
				blocked.mux.ServeHTTP(res, req)
				responses <- res
			}(i)
		}
		until := time.Now().Add(2 * time.Second)
		for blocked.calls.Load() < 4 && time.Now().Before(until) {
			time.Sleep(5 * time.Millisecond)
		}
		if blocked.calls.Load() != 4 {
			t.Fatal("four questions were not admitted")
		}
		busy := ask(t, blocked, `{"question":"Weather?"}`, blocked.tokens[0], 429)
		busyData := busy["data"].(map[string]any)
		if busy["message"] != "Ask gongu is busy. Please try again in a moment." || busyData["reason"].(map[string]any)["code"] != "busy" {
			t.Fatalf("busy response: %#v", busy)
		}
		if _, exists := busyData["remaining"]; exists || blocked.calls.Load() != 4 {
			t.Fatalf("busy must not spend quota: %#v", busy)
		}
		close(release)
		released = true
		for i := 0; i < 4; i++ {
			res := <-responses
			if res.Code != 200 {
				t.Fatalf("admitted question: %d %s", res.Code, res.Body.String())
			}
		}
	})
}
