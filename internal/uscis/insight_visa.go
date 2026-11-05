package uscis

import (
	"context"
	"math"
	"net/http"
	"sort"
	"time"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"gongu/internal/uscis/db"
)

type visaReport struct {
	day   int
	event bool
}
type visaPoint struct {
	Day     int      `json:"day"`
	Waiting float64  `json:"waiting"`
	Low     *float64 `json:"low"`
	High    *float64 `json:"high"`
	AtRisk  int      `json:"atRisk"`
}
type visaGroup struct {
	Office     string      `json:"office"`
	Included   int         `json:"included"`
	Decisions  int         `json:"decisions"`
	Censored   int         `json:"censored"`
	MedianDays *int        `json:"medianDays"`
	P90Days    *int        `json:"p90Days"`
	Curve      []visaPoint `json:"curve"`
}
type visaResponse struct {
	Status     string      `json:"status"`
	Historical bool        `json:"historical"`
	Source     string      `json:"source"`
	From       *string     `json:"from"`
	To         *string     `json:"to"`
	Excluded   int         `json:"excluded"`
	Groups     []visaGroup `json:"groups"`
}

func utcDay(t time.Time) time.Time {
	y, m, d := t.UTC().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}
func visaCurve(name string, reports []visaReport) visaGroup {
	g := visaGroup{Office: name, Included: len(reports), Curve: []visaPoint{{Day: 0, Waiting: 1, AtRisk: len(reports)}}}
	sort.Slice(reports, func(i, j int) bool { return reports[i].day < reports[j].day })
	for _, r := range reports {
		if r.event {
			g.Decisions++
		} else {
			g.Censored++
		}
	}
	risk := len(reports)
	s := 1.0
	greenwood := 0.0
	for i := 0; i < len(reports); {
		j := i
		events := 0
		for j < len(reports) && reports[j].day == reports[i].day {
			if reports[j].event {
				events++
			}
			j++
		}
		if events > 0 {
			s *= 1 - float64(events)/float64(risk)
			p := visaPoint{Day: reports[i].day, Waiting: s, AtRisk: risk}
			if events < risk && s > 0 && s < 1 {
				greenwood += float64(events) / (float64(risk) * float64(risk-events))
				delta := 1.959963984540054 * math.Sqrt(greenwood) / math.Abs(math.Log(s))
				center := math.Log(-math.Log(s))
				low := math.Exp(-math.Exp(center + delta))
				high := math.Exp(-math.Exp(center - delta))
				p.Low = &low
				p.High = &high
			}
			if g.Decisions >= 30 {
				if g.MedianDays == nil && s <= 0.5+1e-12 {
					d := p.Day
					g.MedianDays = &d
				}
				if g.P90Days == nil && s <= 0.1+1e-12 {
					d := p.Day
					g.P90Days = &d
				}
			}
			g.Curve = append(g.Curve, p)
		}
		risk -= j - i
		i = j
	}
	return g
}
func buildVisa(rows []db.Visa221gRow) visaResponse {
	out := visaResponse{Status: "insufficient_data", Historical: true, Source: "Immihelp 221(g) tracker", Groups: []visaGroup{}}
	all := []visaReport{}
	offices := map[string][]visaReport{}
	for _, r := range rows {
		if !r.StartDate.Valid || r.Pending == nil {
			out.Excluded++
			continue
		}
		start := utcDay(r.StartDate.Time)
		var end time.Time
		if *r.Pending {
			if !r.UpdatedAt.Valid || !r.FirstSeenAt.Valid {
				out.Excluded++
				continue
			}
			end = utcDay(r.UpdatedAt.Time)
			if end.Before(start) {
				end = start
			}
			observed := utcDay(r.FirstSeenAt.Time)
			if observed.Before(end) {
				end = observed
			}
		} else {
			if !r.DecisionDate.Valid {
				out.Excluded++
				continue
			}
			end = utcDay(r.DecisionDate.Time)
		}
		days := int(end.Sub(start).Hours() / 24)
		if days < 0 {
			out.Excluded++
			continue
		}
		report := visaReport{days, !*r.Pending}
		all = append(all, report)
		if r.Office != nil && *r.Office != "" {
			offices[*r.Office] = append(offices[*r.Office], report)
		}
		d := start.Format("2006-01-02")
		if out.From == nil || d < *out.From {
			x := d
			out.From = &x
		}
		if out.To == nil || d > *out.To {
			x := d
			out.To = &x
		}
	}
	if len(all) < 30 {
		return out
	}
	out.Status = "ready"
	out.Groups = append(out.Groups, visaCurve("All consulates", all))
	names := make([]string, 0, len(offices))
	for name, rows := range offices {
		if len(rows) >= 30 {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	for _, name := range names {
		out.Groups = append(out.Groups, visaCurve(name, offices[name]))
	}
	return out
}
func (a *api) visa221g(r *core.RequestEvent) error {
	if !validInsightQuery(r) {
		return r.Error(http.StatusBadRequest, "Invalid query parameters.", nil)
	}
	value, err := a.load(r.Request.Context(), "visa-221g", func(ctx context.Context) (any, error) {
		rows, err := a.q.Visa221g(ctx)
		if err != nil {
			return nil, err
		}
		return buildVisa(rows), nil
	})
	if err != nil {
		return unavailable(r)
	}
	return insightSuccess(r, value)
}
