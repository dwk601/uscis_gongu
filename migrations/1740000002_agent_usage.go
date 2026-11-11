package migrations

import (
	"slices"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/migrations"
)

const agentRateLabel = "POST /api/x/agent/ask"

func init() {
	migrations.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		usage := core.NewBaseCollection("agent_usage")
		usage.Fields.Add(
			&core.RelationField{Name: "user", CollectionId: users.Id, Required: true, MaxSelect: 1, CascadeDelete: true},
			&core.TextField{Name: "day", Required: true, Pattern: `^\d{4}-\d{2}-\d{2}$`},
		)
		for _, name := range []string{"input_tokens", "output_tokens", "estimated_tokens", "reserved_tokens"} {
			usage.Fields.Add(&core.NumberField{Name: name, OnlyInt: true})
		}
		usage.AddIndex("idx_agent_usage_user_day", true, "user, day", "")
		if err := app.Save(usage); err != nil {
			return err
		}
		settings := app.Settings()
		settings.RateLimits.Enabled = true
		settings.RateLimits.Rules = append([]core.RateLimitRule{{Label: agentRateLabel, Duration: 60, MaxRequests: 3}}, settings.RateLimits.Rules...)
		return app.Save(settings)
	}, func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("agent_usage")
		if err != nil {
			return err
		}
		if err := app.Delete(c); err != nil {
			return err
		}
		settings := app.Settings()
		settings.RateLimits.Rules = slices.DeleteFunc(settings.RateLimits.Rules, func(r core.RateLimitRule) bool { return r.Label == agentRateLabel })
		return app.Save(settings)
	})
}
