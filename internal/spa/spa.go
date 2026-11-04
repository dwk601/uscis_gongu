// Package spa serves the embedded web build from the PocketBase binary.
package spa

import (
	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"

	"gongu/web"
)

// Register serves the SPA for every GET route not claimed by PocketBase or /api/x handlers.
func Register(app core.App) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/{path...}", apis.Static(web.Dist(), true)).Bind(apis.Gzip())
		return e.Next()
	})
}
