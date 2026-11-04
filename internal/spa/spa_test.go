package spa

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tests"
)

func TestStaticCompression(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	Register(app)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	event := &core.ServeEvent{App: app, Router: router}
	if err := app.OnServe().Trigger(event, func(e *core.ServeEvent) error {
		mux, err := e.Router.BuildMux()
		if err != nil {
			return err
		}
		request := func(encoding string) *httptest.ResponseRecorder {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("Accept-Encoding", encoding)
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, req)
			return response
		}
		plain := request("identity")
		compressed := request("gzip")
		if plain.Code != http.StatusOK || compressed.Code != http.StatusOK {
			t.Fatalf("unexpected status: plain %d, gzip %d", plain.Code, compressed.Code)
		}
		if got := compressed.Header().Get("Content-Encoding"); got != "gzip" {
			t.Fatalf("expected gzip encoding, got %q", got)
		}
		reader, err := gzip.NewReader(compressed.Body)
		if err != nil {
			t.Fatal(err)
		}
		defer reader.Close()
		decoded, err := io.ReadAll(reader)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(decoded, plain.Body.Bytes()) || len(decoded) == 0 {
			t.Fatal("compressed response differs from the uncompressed SPA")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
