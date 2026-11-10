package uscis

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"gongu/internal/uscis/db"
)

type caseBenchmark struct {
	Description           *string  `json:"description"`
	MedianMonths          *float64 `json:"medianMonths"`
	Period                *string  `json:"period"`
	PreviousMedianMonths  *float64 `json:"previousMedianMonths"`
	PreviousPeriod        *string  `json:"previousPeriod"`
	LatestReportingPeriod *string  `json:"latestReportingPeriod"`
	Trend                 *string  `json:"trend"`
	AsOfDate              *string  `json:"asOfDate"`
	Reason                *string  `json:"reason"`
	Source                *string  `json:"source"`
	Population            *string  `json:"population"`
}
type caseCommunity struct {
	FilingYear     *int32     `json:"filingYear"`
	P25Days        *int32     `json:"p25Days"`
	P50Days        *int32     `json:"p50Days"`
	P75Days        *int32     `json:"p75Days"`
	EligibleCount  *int64     `json:"eligibleCount"`
	CompletedCount *int64     `json:"completedCount"`
	CensoredCount  *int64     `json:"censoredCount"`
	ExcludedCount  *int64     `json:"excludedCount"`
	VisaTypes      []string   `json:"visaTypes"`
	AsOfDate       *string    `json:"asOfDate"`
	RefreshedAt    *time.Time `json:"refreshedAt"`
	Reason         *string    `json:"reason"`
	P25Reason      *string    `json:"p25Reason"`
	P75Reason      *string    `json:"p75Reason"`
	Source         *string    `json:"source"`
	Method         *string    `json:"method"`
	Population     *string    `json:"population"`
}

type caseResponse struct {
	Forms         []formSummary   `json:"forms"`
	Form          string          `json:"form"`
	CategoryLabel string          `json:"categoryLabel"`
	Official      caseBenchmark   `json:"official"`
	Trend         []point         `json:"trend"`
	Community     *caseCommunity  `json:"community"`
	Summary       json.RawMessage `json:"summary"`
	Freshness     json.RawMessage `json:"freshness"`
}

func (a *api) caseScreen(r *core.RequestEvent) error {
	if !validInsightQuery(r, "form", "filingYear") {
		return r.Error(http.StatusBadRequest, "Invalid query.", nil)
	}
	form := r.Request.URL.Query().Get("form")
	yearText, hasYear := r.Request.URL.Query()["filingYear"]
	var year int
	if hasYear {
		text := yearText[0]
		parsed, err := strconv.Atoi(text)
		if err != nil || len(text) != 4 || parsed < 1900 || parsed > 9999 {
			return r.Error(http.StatusBadRequest, "Invalid filing year.", nil)
		}
		year = parsed
	}
	ctx, cancel := context.WithTimeout(r.Request.Context(), 5*time.Second)
	defer cancel()
	forms, err := a.forms(ctx)
	if err != nil {
		return unavailable(r)
	}
	detail := forms.details[form]
	if detail == nil {
		return r.Error(http.StatusNotFound, "Unknown form.", nil)
	}
	var selected *official
	var defaultID string
	for _, f := range forms.Forms {
		if f.Form == form {
			defaultID = f.DefaultSeries
			break
		}
	}
	preferred := map[string]string{"I-485": "Application to Register Permanent Residence or Adjust Status (Family)", "I-765": "Application for Employment Authorization (Adjustment Of Status)"}[form]
	for _, s := range detail.Official {
		if s.ID == defaultID {
			selected = s
		}
		if preferred != "" && s.Description == preferred {
			selected = s
			break
		}
	}
	if selected == nil {
		return unavailable(r)
	}
	value, err := a.load(ctx, "case:"+form, func(ctx context.Context) (any, error) { return a.q.CaseEstimates(ctx, &form) })
	if err != nil {
		return unavailable(r)
	}
	rows := value.([]db.CaseEstimatesRow)
	var base, cohort *db.CaseEstimatesRow
	for i := range rows {
		row := &rows[i]
		if str(row.OfficialDescription) != selected.Description {
			continue
		}
		if base == nil || (row.IsDefaultCohort != nil && *row.IsDefaultCohort) {
			base = row
		}
		if hasYear && row.FilingYear != nil && int(*row.FilingYear) == year {
			cohort = row
		}
		if !hasYear && row.IsDefaultCohort != nil && *row.IsDefaultCohort {
			cohort = row
		}
	}
	if base == nil {
		return unavailable(r)
	}
	trend := selected.Points
	if len(trend) > 12 {
		trend = trend[len(trend)-12:]
	}
	out := caseResponse{Forms: forms.Forms, Form: form, CategoryLabel: selected.Label,
		Official: caseBenchmark{base.OfficialDescription, base.OfficialMedianMonths, date(base.OfficialPeriod), base.OfficialPreviousMedianMonths, date(base.OfficialPreviousPeriod), date(base.LatestReportingPeriod), base.OfficialTrend, date(base.AsOfDate), base.OfficialReason, base.OfficialSource, base.OfficialPopulation}, Trend: trend, Summary: base.Summary, Freshness: base.Freshness}
	if hasYear && year > time.Now().UTC().Year() {
		cohort = nil
	}
	if cohort != nil {
		var refreshed *time.Time
		if cohort.CommunityRefreshedAt.Valid {
			refreshed = &cohort.CommunityRefreshedAt.Time
		}
		out.Community = &caseCommunity{cohort.FilingYear, cohort.P25Days, cohort.P50Days, cohort.P75Days, cohort.EligibleCount, cohort.CompletedCount, cohort.CensoredCount, cohort.ExcludedCount, cohort.VisaTypes, date(cohort.CommunityAsOfDate), refreshed, cohort.CommunityReason, cohort.P25Reason, cohort.P75Reason, cohort.CommunitySource, cohort.CommunityMethod, cohort.CommunityPopulation}
	}
	data, err := json.Marshal(out)
	if err != nil || len(data) > 64*1024 {
		return unavailable(r)
	}
	r.Response.Header().Set("Cache-Control", "public, max-age=3600")
	r.Response.Header().Set("Content-Type", "application/json")
	r.Response.WriteHeader(http.StatusOK)
	_, err = r.Response.Write(data)
	return err
}
