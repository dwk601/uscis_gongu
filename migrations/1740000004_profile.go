package migrations

import (
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/migrations"
)

func init() { migrations.Register(upProfile, downProfile) }

func upProfile(app core.App) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	users.Fields.Add(
		&core.SelectField{
			Name: "seeking", Hidden: true, MaxSelect: 18,
			Values: []string{"I-765", "I-539", "I-129", "I-140", "I-485", "I-131", "I-130", "I-129F", "I-751", "I-90", "N-400", "I-526", "I-526E", "I-829", "I-360", "I-821D", "I-601A", "none"},
		},
		&core.SelectField{
			Name: "status", Hidden: true, MaxSelect: 1,
			Values: []string{"citizen", "permanent_resident", "conditional_resident", "pending_green_card", "work_visa", "student", "dependent", "visitor", "humanitarian", "daca_tps", "outside_us", "other", "none"},
		},
		&core.TextField{Name: "country", Hidden: true, Max: 4, Pattern: `^(?:[A-Z]{2}|none)$`},
	)
	return app.Save(users)
}

func downProfile(app core.App) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	for _, name := range []string{"seeking", "status", "country"} {
		users.Fields.RemoveByName(name)
	}
	return app.Save(users)
}
