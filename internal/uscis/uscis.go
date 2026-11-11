// Package uscis owns the read-only connection to the USCIS ETL PostgreSQL database.
package uscis

import (
	"context"
	"errors"
	"net/http"
	"os"
	"time"

	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/hook"
	"github.com/jackc/pgx/v5/pgxpool"
	"gongu/internal/uscis/db"
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

		handlers := &api{q: db.New(pool), cache: make(map[string]entry)}
		auth := apis.RequireAuth("users")
		auth.Priority = apis.DefaultRateLimitMiddlewarePriority - 1
		e.Router.POST("/api/x/agent/ask", handlers.agentAsk).Bind(&hook.Handler[*core.RequestEvent]{
			Priority: -2000,
			Func: func(r *core.RequestEvent) error {
				r.Response.Header().Set("Cache-Control", "no-store")
				return r.Next()
			},
		}, auth)
		e.Router.GET("/api/x/uscis/forms", handlers.formList)
		e.Router.GET("/api/x/uscis/forms/{form}", handlers.form)
		e.Router.GET("/api/x/uscis/forms/{form}/community", handlers.community)
		e.Router.GET("/api/x/uscis/forms/{form}/reddit", handlers.redditTimeline)
		e.Router.GET("/api/x/uscis/bulletin/discussion", handlers.redditDiscussion)
		e.Router.GET("/api/x/uscis/insights/h1b-talk", handlers.redditH1bTalk)
		e.Router.GET("/api/x/uscis/bulletin", handlers.bulletin)
		e.Router.GET("/api/x/uscis/insights/visa-221g", handlers.visa221g)
		e.Router.GET("/api/x/uscis/insights/h1b-pay", handlers.pay)
		e.Router.GET("/api/x/uscis/insights/h1b-employers", handlers.employers)
		e.Router.GET("/api/x/uscis/insights/student-posts", handlers.studentPosts)
		e.Router.GET("/api/x/uscis/health", func(r *core.RequestEvent) error {
			ctx, cancel := context.WithTimeout(r.Request.Context(), 5*time.Second)
			defer cancel()
			if err := pool.Ping(ctx); err != nil {
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
