package main

import (
	"log"

	"ganigeorgiev.com/pocketbase/pocketbase"
	"ganigeorgiev.com/pocketbase/pocketbase/plugins/migratecmd"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/osutils"

	"gongu/internal/spa"
	"gongu/internal/uscis"
	_ "gongu/migrations"
)

func main() {
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: osutils.IsProbablyGoRun(),
	})
	uscis.Register(app)
	spa.Register(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
