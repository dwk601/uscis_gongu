package uscis

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"ganigeorgiev.com/pocketbase/dbx"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
)

type agentBudget struct {
	Limit         int64  `json:"limit"`
	Remaining     int64  `json:"remaining"`
	QuestionLimit int64  `json:"questionLimit"`
	ResetsAt      string `json:"resetsAt"`
}

type agentMeter struct {
	app                                core.App
	id                                 string
	reserved, input, output, estimated int64
	budget                             agentBudget
	failed                             bool
}

var errAgentBudget = errors.New("daily budget exhausted")

func usageRemaining(r *core.Record, limit int64) int64 {
	return max(0, limit-int64(r.GetInt("input_tokens"))-int64(r.GetInt("output_tokens"))-int64(r.GetInt("estimated_tokens"))-int64(r.GetInt("reserved_tokens")))
}

func reserveAgent(ctx context.Context, app core.App, user string, c agentConfig) (*agentMeter, error) {
	now := time.Now().UTC()
	m := &agentMeter{app: app, budget: agentBudget{Limit: c.daily, QuestionLimit: c.question, ResetsAt: now.Truncate(24 * time.Hour).Add(24 * time.Hour).Format(time.RFC3339)}}
	err := app.RunInTransaction(func(tx core.App) error {
		r, err := tx.FindFirstRecordByFilter("agent_usage", "user = {:user} && day = {:day}", dbx.Params{"user": user, "day": now.Format("2006-01-02")})
		if errors.Is(err, sql.ErrNoRows) {
			collection, e := tx.FindCollectionByNameOrId("agent_usage")
			if e != nil {
				return e
			}
			r = core.NewRecord(collection)
			r.Set("user", user)
			r.Set("day", now.Format("2006-01-02"))
		} else if err != nil {
			return err
		}
		m.budget.Remaining = usageRemaining(r, c.daily)
		if m.budget.Remaining < c.question {
			return errAgentBudget
		}
		r.Set("reserved_tokens", int64(r.GetInt("reserved_tokens"))+c.question)
		if err := tx.SaveWithContext(ctx, r); err != nil {
			return err
		}
		m.id, m.reserved = r.Id, c.question
		return nil
	})
	return m, err
}

// Charges move tokens out of this request's reservation. A failed write leaves
// that reservation in place, including across process restarts.
func (m *agentMeter) charge(input, output, estimated int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	release := min(m.reserved, input+output+estimated)
	err := m.app.RunInTransaction(func(tx core.App) error {
		r, err := tx.FindRecordById("agent_usage", m.id)
		if err != nil {
			return err
		}
		for k, v := range map[string]int64{"input_tokens": input, "output_tokens": output, "estimated_tokens": estimated, "reserved_tokens": -release} {
			r.Set(k, int64(r.GetInt(k))+v)
		}
		if err := tx.SaveWithContext(ctx, r); err != nil {
			return err
		}
		m.budget.Remaining = usageRemaining(r, m.budget.Limit)
		return nil
	})
	if err != nil {
		m.failed = true
		return err
	}
	m.reserved -= release
	m.input += input
	m.output += output
	m.estimated += estimated
	return nil
}

func (m *agentMeter) settle() error {
	if m.failed {
		return errors.New("usage write failed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	err := m.app.RunInTransaction(func(tx core.App) error {
		r, err := tx.FindRecordById("agent_usage", m.id)
		if err != nil {
			return err
		}
		r.Set("reserved_tokens", int64(r.GetInt("reserved_tokens"))-m.reserved)
		if err := tx.SaveWithContext(ctx, r); err != nil {
			return err
		}
		m.budget.Remaining = usageRemaining(r, m.budget.Limit)
		return nil
	})
	if err == nil {
		m.reserved = 0
	}
	return err
}
