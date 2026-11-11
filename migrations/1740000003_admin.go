package migrations

import (
	"ganigeorgiev.com/pocketbase/dbx"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/migrations"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/types"
)

func init() { migrations.Register(upAdmin, downAdmin) }

func upAdmin(app core.App) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	users.Fields.Add(&core.SelectField{Name: "role", Values: []string{"admin"}, MaxSelect: 1})
	users.ListRule = types.Pointer(`id = @request.auth.id || @request.auth.role = "admin"`)
	users.ViewRule = types.Pointer(`id = @request.auth.id || @request.auth.role = "admin"`)
	users.CreateRule = types.Pointer(`@request.body.role:isset = false`)
	users.UpdateRule = types.Pointer(`id = @request.auth.id && @request.body.role:isset = false`)
	users.DeleteRule = types.Pointer(`id = @request.auth.id`)
	users.ManageRule = nil
	if err := app.Save(users); err != nil {
		return err
	}
	for _, name := range []string{"posts", "comments"} {
		collection, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			return err
		}
		collection.DeleteRule = types.Pointer(`author = @request.auth.id || @request.auth.role = "admin"`)
		if err := app.Save(collection); err != nil {
			return err
		}
	}

	var candidates []*core.Record
	if err := app.RecordQuery(users).Where(dbx.NewExp(`lower(trim([[name]])) = 'admin'`)).Limit(2).All(&candidates); err != nil {
		return err
	}
	if len(candidates) != 1 {
		app.Logger().Info("Admin bootstrap: none — set role in dashboard")
		return nil
	}
	candidates[0].Set("role", "admin")
	if err := app.Save(candidates[0]); err != nil {
		return err
	}
	app.Logger().Info("Admin bootstrap: promoted", "id", candidates[0].Id)
	return nil
}

func downAdmin(app core.App) error {
	for _, name := range []string{"posts", "comments"} {
		collection, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			return err
		}
		collection.DeleteRule = types.Pointer(`author = @request.auth.id`)
		if err := app.Save(collection); err != nil {
			return err
		}
	}
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	users.ListRule = types.Pointer(`id = @request.auth.id`)
	users.ViewRule = types.Pointer(`id = @request.auth.id`)
	users.CreateRule = types.Pointer("")
	users.UpdateRule = types.Pointer(`id = @request.auth.id`)
	users.DeleteRule = types.Pointer(`id = @request.auth.id`)
	users.ManageRule = nil
	if err := app.Save(users); err != nil {
		return err
	}
	users.Fields.RemoveByName("role")
	return app.Save(users)
}
