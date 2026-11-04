package uscis

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/sync/singleflight"
	"gongu/internal/uscis/db"
)

type entry struct {
	value   any
	expires time.Time
}
type api struct {
	q       *db.Queries
	mu      sync.Mutex
	cache   map[string]entry
	flights singleflight.Group
}

func (a *api) load(ctx context.Context, key string, fetch func(context.Context) (any, error)) (any, error) {
	a.mu.Lock()
	item, ok := a.cache[key]
	a.mu.Unlock()
	if ok && time.Now().Before(item.expires) {
		return item.value, nil
	}
	ch := a.flights.DoChan(key, func() (any, error) {
		a.mu.Lock()
		item, ok := a.cache[key]
		a.mu.Unlock()
		if ok && time.Now().Before(item.expires) {
			return item.value, nil
		}
		v, err := fetch(ctx)
		if err == nil {
			a.mu.Lock()
			a.cache[key] = entry{v, time.Now().Add(time.Hour)}
			a.mu.Unlock()
		}
		return v, err
	})
	select {
	case result := <-ch:
		return result.Val, result.Err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
func date(d pgtype.Date) *string {
	if !d.Valid {
		return nil
	}
	s := d.Time.Format("2006-01-02")
	return &s
}
func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func slug(s string) string {
	h := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%s-%x", strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(s), "-"), "-"), h[:4])
}
func label(s string) string {
	i := strings.LastIndex(s, "(")
	if i >= 0 && strings.HasSuffix(s, ")") {
		return s[i+1 : len(s)-1]
	}
	return s
}

var featured = []string{"I-485", "I-130", "I-765", "I-131", "N-400", "I-140", "I-129F", "I-751", "I-90", "I-539", "I-129", "I-526", "I-821D", "I-601A", "I-360"}
var names = map[string]string{"I-485": "Green card (adjust status)", "I-130": "Petition for a relative", "I-765": "Work permit", "I-131": "Travel document", "N-400": "Naturalization", "I-140": "Immigrant worker petition", "I-129F": "Fiancé(e) petition", "I-751": "Remove conditions on residence", "I-90": "Replace green card", "I-539": "Extend or change status", "I-129": "Nonimmigrant worker petition", "I-526": "Immigrant investor petition", "I-821D": "Deferred action for childhood arrivals", "I-601A": "Provisional unlawful presence waiver", "I-360": "Special immigrant petition"}

type period struct {
	FiscalYear *int32 `json:"fiscalYear"`
	Quarter    *int32 `json:"quarter"`
}
type point struct {
	period
	QuarterStart     *string  `json:"quarterStart"`
	Received         *float64 `json:"received"`
	Approved         *float64 `json:"approved"`
	Denied           *float64 `json:"denied"`
	Completed        *float64 `json:"completed"`
	Pending          *float64 `json:"pending"`
	ProcessingMonths *float64 `json:"processingMonths"`
}
type official struct {
	ID          string   `json:"id"`
	Label       string   `json:"label"`
	Category    *string  `json:"category"`
	Description string   `json:"description"`
	Points      []point  `json:"points"`
	SourceFiles []string `json:"sourceFiles"`
}
type formDetail struct {
	Form     string      `json:"form"`
	Name     string      `json:"name"`
	Official []*official `json:"official"`
}
type formSummary struct {
	Form          string `json:"form"`
	Name          string `json:"name"`
	Featured      bool   `json:"featured"`
	DefaultSeries string `json:"defaultSeries"`
	LatestPeriod  period `json:"latestPeriod"`
}
type formsData struct {
	Forms   []formSummary `json:"forms"`
	details map[string]*formDetail
}

func buildForms(rows []db.FormsRow) formsData {
	out := formsData{Forms: []formSummary{}, details: map[string]*formDetail{}}
	series := map[string]*official{}
	latest := map[string]db.FormsRow{}
	for _, r := range rows {
		if r.Form == nil || r.Description == nil || r.FiscalYear == nil || r.Quarter == nil {
			continue
		}
		f, d := *r.Form, *r.Description
		key := f + "\x00" + d
		detail := out.details[f]
		if detail == nil {
			name := names[f]
			if name == "" {
				name = d
			}
			detail = &formDetail{Form: f, Name: name, Official: []*official{}}
			out.details[f] = detail
		}
		s := series[key]
		if s == nil {
			s = &official{ID: slug(d), Label: label(d), Category: r.Category, Description: d, Points: []point{}, SourceFiles: []string{}}
			series[key] = s
			detail.Official = append(detail.Official, s)
		}
		s.Points = append(s.Points, point{period{r.FiscalYear, r.Quarter}, date(r.QuarterStart), r.Received, r.Approved, r.Denied, r.Completed, r.Pending, r.ProcessingMonths})
		if r.SourceFile != nil {
			found := false
			for _, v := range s.SourceFiles {
				if v == *r.SourceFile {
					found = true
					break
				}
			}
			if !found {
				s.SourceFiles = append(s.SourceFiles, *r.SourceFile)
			}
		}
		latest[key] = r
	}
	ranks := map[string]int{}
	for i, f := range featured {
		ranks[f] = i + 1
	}
	for f, d := range out.details {
		sum := formSummary{Form: f, Name: d.Name, Featured: ranks[f] > 0}
		var best *float64
		for _, s := range d.Official {
			r := latest[f+"\x00"+s.Description]
			if sum.LatestPeriod.FiscalYear == nil || *r.FiscalYear > *sum.LatestPeriod.FiscalYear || (*r.FiscalYear == *sum.LatestPeriod.FiscalYear && *r.Quarter > *sum.LatestPeriod.Quarter) {
				sum.LatestPeriod = period{r.FiscalYear, r.Quarter}
			}
		}
		for _, s := range d.Official {
			r := latest[f+"\x00"+s.Description]
			if *r.FiscalYear == *sum.LatestPeriod.FiscalYear && *r.Quarter == *sum.LatestPeriod.Quarter && (sum.DefaultSeries == "" || (r.Received != nil && (best == nil || *r.Received > *best))) {
				sum.DefaultSeries = s.ID
				best = r.Received
			}
		}
		out.Forms = append(out.Forms, sum)
	}
	sort.Slice(out.Forms, func(i, j int) bool {
		x, y := ranks[out.Forms[i].Form], ranks[out.Forms[j].Form]
		if x == 0 {
			x = 1000
		}
		if y == 0 {
			y = 1000
		}
		if x == y {
			return out.Forms[i].Form < out.Forms[j].Form
		}
		return x < y
	})
	return out
}

type communityPoint struct {
	FilingYear   *int32   `json:"filingYear"`
	SampleSize   *int64   `json:"sampleSize"`
	Completed    *int64   `json:"completed"`
	Pending      *int64   `json:"pending"`
	PendingShare *float64 `json:"pendingShare"`
	P10          *float64 `json:"p10"`
	P50          *float64 `json:"p50"`
	P90          *float64 `json:"p90"`
}
type communitySeries struct {
	Source   string           `json:"source"`
	Stage    string           `json:"stage"`
	VisaType *string          `json:"visaType"`
	Meaning  string           `json:"meaning"`
	Points   []communityPoint `json:"points"`
}

var stages = map[string][2]string{"I-485": {"aos", "Filed → decision"}, "I-765": {"ead", "Filed → approved"}, "I-131": {"ap", "Filed → approved"}, "I-751": {"lift", "Filed → decision"}, "N-400": {"n400", "Filed → oath"}, "I-129F": {"k1", "Sent → NOA2"}}

type category struct {
	Code  string `json:"code"`
	Group string `json:"group"`
}
type bulletinPoint struct {
	Month  *string `json:"month"`
	Cutoff *string `json:"cutoff"`
	Status string  `json:"status"`
}
type bulletinSeries struct {
	Country string          `json:"country"`
	Label   *string         `json:"label"`
	Points  []bulletinPoint `json:"points"`
}

func (a *api) serve(r *core.RequestEvent, kind string) error {
	timeout := 5 * time.Second
	if kind == "community" {
		timeout = 8 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Request.Context(), timeout)
	defer cancel()
	fail := func() error { return r.Error(http.StatusServiceUnavailable, "USCIS database unavailable.", nil) }
	getForms := func() (formsData, error) {
		v, e := a.load(ctx, "forms", func(ctx context.Context) (any, error) {
			rows, e := a.q.Forms(ctx)
			if e != nil {
				return nil, e
			}
			return buildForms(rows), nil
		})
		if e != nil {
			return formsData{}, e
		}
		return v.(formsData), nil
	}
	var response any
	switch kind {
	case "forms", "form", "community":
		data, err := getForms()
		if err != nil {
			return fail()
		}
		if kind == "forms" {
			response = data
		} else {
			f := r.Request.PathValue("form")
			detail := data.details[f]
			if detail == nil {
				return r.Error(http.StatusNotFound, "Unknown form.", nil)
			}
			if kind == "form" {
				response = detail
			} else {
				list := []communitySeries{}
				stage, ok := stages[f]
				if ok {
					v, e := a.load(ctx, "community", func(ctx context.Context) (any, error) { return a.q.Community(ctx) })
					if e != nil {
						return fail()
					}
					index := map[string]int{}
					for _, row := range v.([]db.CommunityRow) {
						if str(row.Stage) != stage[0] {
							continue
						}
						key := str(row.VisaType)
						i, exists := index[key]
						if !exists {
							i = len(list)
							index[key] = i
							list = append(list, communitySeries{"visajourney", stage[0], row.VisaType, stage[1], []communityPoint{}})
						}
						list[i].Points = append(list[i].Points, communityPoint{row.FilingYear, row.SampleSize, row.CompletedCount, row.PendingCount, row.PendingShare, row.P10Days, row.P50Days, row.P90Days})
					}
				}
				response = struct {
					Form   string            `json:"form"`
					Series []communitySeries `json:"series"`
				}{f, list}
			}
		}
	case "bulletin":
		categoryFilter := r.Request.URL.Query().Get("category")
		if categoryFilter == "" {
			categoryFilter = "EB2"
		}
		chart := r.Request.URL.Query().Get("chart")
		if chart == "" {
			chart = "final_action"
		}
		if chart != "final_action" && chart != "dates_for_filing" {
			return r.Error(http.StatusBadRequest, "Invalid chart.", nil)
		}
		v, e := a.load(ctx, "bulletin", func(ctx context.Context) (any, error) { return a.q.Bulletin(ctx) })
		if e != nil {
			return fail()
		}
		categories := []category{}
		seen := map[string]bool{}
		list := []bulletinSeries{}
		index := map[string]int{}
		for _, row := range v.([]db.BulletinRow) {
			code := str(row.CategoryCode)
			group := str(row.CategoryGroup)
			if !seen[code] {
				categories = append(categories, category{code, group})
				seen[code] = true
			}
			if code != categoryFilter || str(row.Chart) != chart {
				continue
			}
			country := str(row.CountryCode)
			i, ok := index[country]
			if !ok {
				i = len(list)
				index[country] = i
				list = append(list, bulletinSeries{country, row.CountryLabel, []bulletinPoint{}})
			}
			status := "date"
			if row.IsCurrent != nil && *row.IsCurrent {
				status = "current"
			} else if row.IsUnavailable != nil && *row.IsUnavailable {
				status = "unavailable"
			}
			list[i].Points = append(list[i].Points, bulletinPoint{date(row.BulletinMonth), date(row.CutoffDate), status})
		}
		if !seen[categoryFilter] {
			return r.Error(http.StatusBadRequest, "Invalid category.", nil)
		}
		response = struct {
			Categories []category       `json:"categories"`
			Category   string           `json:"category"`
			Chart      string           `json:"chart"`
			Series     []bulletinSeries `json:"series"`
		}{categories, categoryFilter, chart, list}
	}
	r.Response.Header().Set("Cache-Control", "public, max-age=3600")
	return r.JSON(http.StatusOK, response)
}
