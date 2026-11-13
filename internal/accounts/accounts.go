package accounts

import (
	"slices"
	"strings"
	"unicode"

	validation "ganigeorgiev.com/pocketbase/ozzo-validation/v4"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"golang.org/x/text/unicode/norm"
)

func Register(app core.App) {
	app.OnRecordCreateRequest("users").BindFunc(loadProfileAnswers)
	app.OnRecordUpdateRequest("users").BindFunc(loadProfileAnswers)

	app.OnRecordValidate("users").BindFunc(func(e *core.RecordEvent) error {
		name := e.Record.GetString("name")
		if (e.Record.IsNew() || name != e.Record.Original().GetString("name")) &&
			e.Record.GetString("role") != "admin" && reserved(name) {
			return validation.Errors{"name": validation.NewError("validation_reserved_name", "That name is reserved.")}
		}

		seeking := e.Record.GetStringSlice("seeking")
		status := e.Record.GetString("status")
		country := e.Record.GetString("country")
		errs := validation.Errors{}
		if slices.Contains(seeking, "none") && len(seeking) > 1 {
			errs["seeking"] = validation.NewError("validation_exclusive", "Choose either none or the forms you are seeking.")
		}
		if len(seeking) > 0 || status != "" || country != "" {
			if len(seeking) == 0 {
				errs["seeking"] = validation.NewError("validation_required", "Complete all profile answers.")
			}
			if status == "" {
				errs["status"] = validation.NewError("validation_required", "Complete all profile answers.")
			}
			if country == "" {
				errs["country"] = validation.NewError("validation_required", "Complete all profile answers.")
			}
		}
		if len(errs) > 0 {
			return errs
		}
		return e.Next()
	})

	app.OnRecordEnrich("users").BindFunc(func(e *core.RecordEnrichEvent) error {
		// Reveal answers to their owner; keep PocketBase's default visibility otherwise.
		if err := e.Next(); err != nil {
			return err
		}
		if e.RequestInfo != nil && e.RequestInfo.Auth != nil &&
			e.RequestInfo.Auth.Collection().Id == e.Record.Collection().Id &&
			e.RequestInfo.Auth.Id == e.Record.Id {
			e.Record.Unhide("seeking", "status", "country")
		}
		return nil
	})
}

// PocketBase strips hidden fields from writes. Load only profile answers after
// the collection rules have authorized the create or update request.
func loadProfileAnswers(e *core.RecordRequestEvent) error {
	data := map[string]any{}
	if err := e.BindBody(&data); err != nil {
		return e.BadRequestError("Invalid profile answers.", err)
	}
	for _, name := range []string{"seeking", "status", "country"} {
		if value, ok := data[name]; ok {
			e.Record.Set(name, value)
		}
	}
	return e.Next()
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
