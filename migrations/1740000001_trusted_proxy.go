package migrations

import (
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/migrations"
)

// Production sits behind Cloudflare and Traefik; Traefik replaces X-Forwarded-For
// with the Cloudflare edge IP, so rate limits key on Cloudflare's client header.
func init() { migrations.Register(upTrustedProxy, downTrustedProxy) }

func upTrustedProxy(app core.App) error {
	settings := app.Settings()
	settings.TrustedProxy.Headers = []string{"CF-Connecting-IP"}
	return app.Save(settings)
}

func downTrustedProxy(app core.App) error {
	settings := app.Settings()
	settings.TrustedProxy.Headers = nil
	return app.Save(settings)
}
