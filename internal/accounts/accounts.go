package accounts

import (
	"strings"
	"unicode"

	validation "ganigeorgiev.com/pocketbase/ozzo-validation/v4"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"golang.org/x/text/unicode/norm"
)

func Register(app core.App) {
	app.OnRecordValidate("users").BindFunc(func(e *core.RecordEvent) error {
		name := e.Record.GetString("name")
		if (e.Record.IsNew() || name != e.Record.Original().GetString("name")) &&
			e.Record.GetString("role") != "admin" && reserved(name) {
			return validation.Errors{"name": validation.NewError("validation_reserved_name", "That name is reserved.")}
		}
		return e.Next()
	})
}

// reserved folds width/compatibility forms and drops invisible characters so
// "ａｄｍｉｎ" or "ad\u200bmin" cannot slip past the check.
func reserved(name string) bool {
	visible := strings.Map(func(r rune) rune {
		if unicode.In(r, unicode.Cf, unicode.Cc, unicode.Mn) {
			return -1
		}
		return r
	}, norm.NFKD.String(name))
	return strings.Contains(strings.ToLower(visible), "admin")
}
