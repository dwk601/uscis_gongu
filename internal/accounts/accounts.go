package accounts

import (
	"strings"

	validation "ganigeorgiev.com/pocketbase/ozzo-validation/v4"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
)

func Register(app core.App) {
	app.OnRecordValidate("users").BindFunc(func(e *core.RecordEvent) error {
		name := e.Record.GetString("name")
		if (e.Record.IsNew() || name != e.Record.Original().GetString("name")) &&
			e.Record.GetString("role") != "admin" && strings.Contains(strings.ToLower(name), "admin") {
			return validation.Errors{"name": validation.NewError("validation_reserved_name", "That name is reserved.")}
		}
		return e.Next()
	})
}
