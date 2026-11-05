// Package spa serves the embedded web build from the PocketBase binary.
package spa

import (
	"io/fs"
	"regexp"
	"strings"

	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"

	"gongu/web"
)

var hashedAsset = regexp.MustCompile(`^assets/[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$`)

// Register serves the SPA for every GET route not claimed by PocketBase or /api/x handlers.
func Register(app core.App) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		dist := web.Dist()
		static := apis.Static(dist, true)
		e.Router.GET("/{path...}", func(r *core.RequestEvent) error {
			name := strings.TrimPrefix(r.Request.URL.Path, "/")
			r.Response.Header().Set("Cache-Control", "no-cache")
			if hashedAsset.MatchString(name) {
				if info, err := fs.Stat(dist, name); err == nil && !info.IsDir() {
					r.Response.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
			}
			return static(r)
		}).Bind(apis.Gzip())
		return e.Next()
	})
}
