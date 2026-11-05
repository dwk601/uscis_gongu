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
		timeout := 5 * time.Second
		if key == "community" {
			timeout = 8 * time.Second
		}
		fillCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
		defer cancel()
		v, err := fetch(fillCtx)
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
	if !strings.HasSuffix(s, ")") {
		return s
	}
	depth := 0
	for i := len(s) - 1; i >= 0; i-- {
		switch s[i] {
		case ')':
			depth++
		case '(':
			depth--
			if depth == 0 {
				if i > 0 && s[i-1] == ' ' {
					return s[i+1 : len(s)-1]
				}
				return s
			}
		}
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

func (a *api) forms(ctx context.Context) (formsData, error) {
	value, err := a.load(ctx, "forms", func(ctx context.Context) (any, error) {
		rows, err := a.q.Forms(ctx)
		if err != nil {
			return nil, err
		}
		return buildForms(rows), nil
	})
	if err != nil {
		return formsData{}, err
	}
	return value.(formsData), nil
}

func unavailable(r *core.RequestEvent) error {
	return r.Error(http.StatusServiceUnavailable, "USCIS database unavailable.", nil)
}

func success(r *core.RequestEvent, response any) error {
	r.Response.Header().Set("Cache-Control", "public, max-age=3600")
	return r.JSON(http.StatusOK, response)
}

func (a *api) formList(r *core.RequestEvent) error {
	ctx, cancel := context.WithTimeout(r.Request.Context(), 5*time.Second)
	defer cancel()
	data, err := a.forms(ctx)
	if err != nil {
		return unavailable(r)
	}
	return success(r, data)
}

func (a *api) form(r *core.RequestEvent) error {
	ctx, cancel := context.WithTimeout(r.Request.Context(), 5*time.Second)
	defer cancel()
	data, err := a.forms(ctx)
	if err != nil {
		return unavailable(r)
	}
	detail := data.details[r.Request.PathValue("form")]
	if detail == nil {
		return r.Error(http.StatusNotFound, "Unknown form.", nil)
	}
	return success(r, detail)
}

func (a *api) community(r *core.RequestEvent) error {
	ctx, cancel := context.WithTimeout(r.Request.Context(), 8*time.Second)
	defer cancel()
	data, err := a.forms(ctx)
	if err != nil {
		return unavailable(r)
	}
	form := r.Request.PathValue("form")
	if data.details[form] == nil {
		return r.Error(http.StatusNotFound, "Unknown form.", nil)
	}
	series := []communitySeries{}
	stage, mapped := stages[form]
	if mapped {
		value, err := a.load(ctx, "community", func(ctx context.Context) (any, error) { return a.q.Community(ctx) })
		if err != nil {
			return unavailable(r)
		}
		index := map[string]int{}
		for _, row := range value.([]db.CommunityRow) {
			if str(row.Stage) != stage[0] {
				continue
			}
			visaType := str(row.VisaType)
			position, exists := index[visaType]
			if !exists {
				position = len(series)
				index[visaType] = position
				series = append(series, communitySeries{"visajourney", stage[0], row.VisaType, stage[1], []communityPoint{}})
			}
			series[position].Points = append(series[position].Points, communityPoint{row.FilingYear, row.SampleSize, row.CompletedCount, row.PendingCount, row.PendingShare, row.P10Days, row.P50Days, row.P90Days})
		}
	}
	return success(r, struct {
		Form   string            `json:"form"`
		Series []communitySeries `json:"series"`
	}{form, series})
}

func (a *api) bulletin(r *core.RequestEvent) error {
	ctx, cancel := context.WithTimeout(r.Request.Context(), 5*time.Second)
	defer cancel()
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
	value, err := a.load(ctx, "bulletin", func(ctx context.Context) (any, error) { return a.q.Bulletin(ctx) })
	if err != nil {
		return unavailable(r)
	}
	categories := []category{}
	seen := map[string]bool{}
	series := []bulletinSeries{}
	index := map[string]int{}
	for _, row := range value.([]db.BulletinRow) {
		code := str(row.CategoryCode)
		if !seen[code] {
			categories = append(categories, category{code, str(row.CategoryGroup)})
			seen[code] = true
		}
		if code != categoryFilter || str(row.Chart) != chart {
			continue
		}
		country := str(row.CountryCode)
		position, exists := index[country]
		if !exists {
			position = len(series)
			index[country] = position
			series = append(series, bulletinSeries{country, row.CountryLabel, []bulletinPoint{}})
		}
		status := "date"
		if row.IsCurrent != nil && *row.IsCurrent {
			status = "current"
		} else if row.IsUnavailable != nil && *row.IsUnavailable {
			status = "unavailable"
		}
		series[position].Points = append(series[position].Points, bulletinPoint{date(row.BulletinMonth), date(row.CutoffDate), status})
	}
	if !seen[categoryFilter] {
		return r.Error(http.StatusBadRequest, "Invalid category.", nil)
	}
	return success(r, struct {
		Categories []category       `json:"categories"`
		Category   string           `json:"category"`
		Chart      string           `json:"chart"`
		Series     []bulletinSeries `json:"series"`
	}{categories, categoryFilter, chart, series})
}
