// Package uscis owns the read-only connection to the USCIS ETL PostgreSQL database.
package uscis

import (
	"context"
	"errors"
	"net/http"
	"os"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"github.com/jackc/pgx/v5/pgxpool"
)

const databaseURLEnv = "USCIS_DATABASE_URL"

// Register opens the pool for the lifetime of `serve` and mounts the /api/x/uscis routes.
func Register(app core.App) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		pool, err := openPool()
		if err != nil {
			return err
		}
		e.App.OnTerminate().BindFunc(func(t *core.TerminateEvent) error {
			pool.Close()
			return t.Next()
		})

		e.Router.GET("/api/x/uscis/health", func(r *core.RequestEvent) error {
			if err := pool.Ping(r.Request.Context()); err != nil {
				return r.Error(http.StatusServiceUnavailable, "USCIS database unavailable.", nil)
			}
			return r.NoContent(http.StatusNoContent)
		})
		return e.Next()
	})
}

// openPool connects lazily; grants on the app role remain the real read boundary.
func openPool() (*pgxpool.Pool, error) {
	url := os.Getenv(databaseURLEnv)
	if url == "" {
		return nil, errors.New(databaseURLEnv + " is not set")
	}
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	config.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
	return pgxpool.NewWithConfig(context.Background(), config)
}
