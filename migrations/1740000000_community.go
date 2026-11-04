package migrations

import (
	"fmt"
	"slices"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/migrations"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/types"
)

var socialLimits = []string{"users:create", "posts:create", "comments:create", "votes:create"}

func init() { migrations.Register(upCommunity, downCommunity) }

func upCommunity(app core.App) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	users.CreateRule = types.Pointer("")
	users.PasswordAuth.Enabled = true
	users.PasswordAuth.IdentityFields = []string{"email"}
	users.OAuth2.Enabled = false
	users.OTP.Enabled = false
	users.MFA.Enabled = false
	users.AuthAlert.Enabled = false
	users.Fields.GetByName("name").(*core.TextField).Max = 50
	if err := app.Save(users); err != nil {
		return err
	}

	relation := func(name, id string) *core.RelationField {
		return &core.RelationField{Name: name, CollectionId: id, Required: true, MaxSelect: 1, CascadeDelete: true}
	}
	created := func() *core.AutodateField { return &core.AutodateField{Name: "created", OnCreate: true} }
	posts := core.NewBaseCollection("posts")
	posts.ListRule = types.Pointer("")
	posts.ViewRule = types.Pointer("")
	posts.CreateRule = types.Pointer(`@request.auth.id != "" && author = @request.auth.id`)
	posts.DeleteRule = types.Pointer(`author = @request.auth.id`)
	posts.Fields.Add(&core.TextField{Name: "title", Required: true, Max: 120}, &core.TextField{Name: "body", Max: 5000}, &core.TextField{Name: "form", Max: 12}, relation("author", users.Id), created(), &core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true})
	posts.AddIndex("idx_posts_created", false, "created", "")
	if err := app.Save(posts); err != nil {
		return err
	}
	comments := core.NewBaseCollection("comments")
	comments.ListRule = types.Pointer("")
	comments.ViewRule = types.Pointer("")
	comments.CreateRule = types.Pointer(`@request.auth.id != "" && author = @request.auth.id`)
	comments.DeleteRule = types.Pointer(`author = @request.auth.id`)
	comments.Fields.Add(relation("post", posts.Id), relation("author", users.Id), &core.TextField{Name: "body", Required: true, Max: 2000}, created())
	comments.AddIndex("idx_comments_post_created", false, "post, created", "")
	if err := app.Save(comments); err != nil {
		return err
	}
	votes := core.NewBaseCollection("votes")
	votes.ListRule = types.Pointer(`user = @request.auth.id`)
	votes.ViewRule = types.Pointer(`user = @request.auth.id`)
	votes.CreateRule = types.Pointer(`@request.auth.id != "" && user = @request.auth.id`)
	votes.DeleteRule = types.Pointer(`user = @request.auth.id`)
	votes.Fields.Add(relation("post", posts.Id), relation("user", users.Id), created())
	votes.AddIndex("idx_votes_post_user", true, "post, user", "")
	if err := app.Save(votes); err != nil {
		return err
	}
	for _, v := range []struct{ name, query string }{
		{"post_feed", `SELECT posts.id, posts.title, posts.body, posts.form, posts.author, users.name AS author_name, posts.created, CAST((SELECT count(*) FROM votes WHERE votes.post = posts.id) AS INTEGER) AS votes, CAST((SELECT count(*) FROM comments WHERE comments.post = posts.id) AS INTEGER) AS comments FROM posts JOIN users ON users.id = posts.author`},
		{"comment_feed", `SELECT comments.id, comments.post, comments.body, comments.author, users.name AS author_name, comments.created FROM comments JOIN users ON users.id = comments.author`},
	} {
		c := core.NewViewCollection(v.name)
		c.ListRule = types.Pointer("")
		c.ViewRule = types.Pointer("")
		c.ViewQuery = v.query
		if err := app.Save(c); err != nil {
			return fmt.Errorf("%s: %w", v.name, err)
		}
	}
	settings := app.Settings()
	settings.RateLimits.Enabled = true
	for _, label := range socialLimits {
		settings.RateLimits.Rules = append(settings.RateLimits.Rules, core.RateLimitRule{Label: label, Duration: 60, MaxRequests: 10})
	}
	return app.Save(settings)
}

func downCommunity(app core.App) error {
	for _, name := range []string{"comment_feed", "post_feed", "votes", "comments", "posts"} {
		c, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			return err
		}
		if err := app.Delete(c); err != nil {
			return err
		}
	}
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	defaults := core.NewAuthCollection("users")
	users.PasswordAuth = defaults.PasswordAuth
	users.OAuth2.Enabled = defaults.OAuth2.Enabled
	users.OTP.Enabled = defaults.OTP.Enabled
	users.MFA.Enabled = defaults.MFA.Enabled
	users.AuthAlert.Enabled = defaults.AuthAlert.Enabled
	users.Fields.GetByName("name").(*core.TextField).Max = 255
	if err := app.Save(users); err != nil {
		return err
	}
	settings := app.Settings()
	settings.RateLimits.Rules = slices.DeleteFunc(settings.RateLimits.Rules, func(r core.RateLimitRule) bool { return slices.Contains(socialLimits, r.Label) })
	settings.RateLimits.Enabled = false
	return app.Save(settings)
}
