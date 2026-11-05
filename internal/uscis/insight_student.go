package uscis

import (
	"context"
	"math"
	"net/http"
	"time"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"gongu/internal/uscis/db"
)

type studentZ struct {
	Sevis  *float64 `json:"sevis"`
	CPT    *float64 `json:"cpt"`
	Policy *float64 `json:"policy"`
}
type studentWeek struct {
	Week    string   `json:"week"`
	Covered bool     `json:"covered"`
	All     *int32   `json:"all"`
	Sevis   *int32   `json:"sevis"`
	CPT     *int32   `json:"cpt"`
	Policy  *int32   `json:"policy"`
	Z       studentZ `json:"z"`
}
type studentTotal struct {
	Posts int64 `json:"posts"`
}
type studentResponse struct {
	From   *string                 `json:"from"`
	To     *string                 `json:"to"`
	Weeks  []studentWeek           `json:"weeks"`
	Topics map[string]studentTotal `json:"topics"`
}

func studentValue(w studentWeek, topic string) *int32 {
	switch topic {
	case "sevis":
		return w.Sevis
	case "cpt":
		return w.CPT
	default:
		return w.Policy
	}
}
func buildStudent(rows []db.StudentPostWeek) studentResponse {
	out := studentResponse{Weeks: []studentWeek{}, Topics: map[string]studentTotal{"sevis": {}, "cpt": {}, "policy": {}}}
	for _, r := range rows {
		if !r.WeekStart.Valid || r.Topic == nil {
			continue
		}
		d := *date(r.WeekStart)
		if len(out.Weeks) == 0 || out.Weeks[len(out.Weeks)-1].Week != d {
			out.Weeks = append(out.Weeks, studentWeek{Week: d, Covered: r.Covered != nil && *r.Covered})
		}
		w := &out.Weeks[len(out.Weeks)-1]
		switch *r.Topic {
		case "all":
			w.All = r.Posts
		case "sevis":
			w.Sevis = r.Posts
		case "cpt":
			w.CPT = r.Posts
		case "policy":
			w.Policy = r.Posts
		}
		if w.Covered && r.Posts != nil {
			if t, ok := out.Topics[*r.Topic]; ok {
				t.Posts += int64(*r.Posts)
				out.Topics[*r.Topic] = t
			}
		}
	}
	if len(out.Weeks) > 0 {
		out.From = &out.Weeks[0].Week
		out.To = &out.Weeks[len(out.Weeks)-1].Week
	}
	for i := 12; i < len(out.Weeks); i++ {
		w := &out.Weeks[i]
		if !w.Covered {
			continue
		}
		target, err := time.Parse("2006-01-02", w.Week)
		if err != nil {
			continue
		}
		for _, topic := range []string{"sevis", "cpt", "policy"} {
			x := studentValue(*w, topic)
			if x == nil || out.Topics[topic].Posts < 30 {
				continue
			}
			sum := 0.0
			valid := true
			for j := 1; j <= 12; j++ {
				prev := out.Weeks[i-j]
				v := studentValue(prev, topic)
				if !prev.Covered || v == nil || prev.Week != target.AddDate(0, 0, -7*j).Format("2006-01-02") {
					valid = false
					break
				}
				sum += float64(*v)
			}
			if !valid {
				continue
			}
			mean := sum / 12
			variance := 0.0
			for j := 1; j <= 12; j++ {
				diff := float64(*studentValue(out.Weeks[i-j], topic)) - mean
				variance += diff * diff
			}
			sd := math.Sqrt(variance / 11)
			if sd == 0 {
				continue
			}
			z := (float64(*x) - mean) / sd
			switch topic {
			case "sevis":
				w.Z.Sevis = &z
			case "cpt":
				w.Z.CPT = &z
			case "policy":
				w.Z.Policy = &z
			}
		}
	}
	return out
}
func (a *api) studentPosts(r *core.RequestEvent) error {
	if !validInsightQuery(r) {
		return r.Error(http.StatusBadRequest, "Invalid query parameters.", nil)
	}
	value, err := a.load(r.Request.Context(), "student-posts", func(ctx context.Context) (any, error) {
		rows, err := a.q.StudentWeeks(ctx)
		if err != nil {
			return nil, err
		}
		return buildStudent(rows), nil
	})
	if err != nil {
		return unavailable(r)
	}
	return insightSuccess(r, value)
}
