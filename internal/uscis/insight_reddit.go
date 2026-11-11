package uscis

import (
	"context"
	"net/http"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"gongu/internal/uscis/db"
)

var redditDescriptions = map[string]string{
	"I-765": "Application for Employment Authorization (All Other)",
	"I-129": "Petition for a Nonimmigrant Worker",
	"I-140": "Immigrant Petition for Alien Workers",
}

type redditPoint struct {
	FiledMonth       *string  `json:"filedMonth"`
	ApprovedReports  *int32   `json:"approvedReports"`
	P10Days          *float64 `json:"p10Days"`
	P50Days          *float64 `json:"p50Days"`
	P90Days          *float64 `json:"p90Days"`
	QuarterStart     *string  `json:"quarterStart"`
	ProcessingMonths *float64 `json:"processingMonths"`
}
type redditSeries struct {
	CaseType *string       `json:"caseType"`
	Premium  *bool         `json:"premium"`
	Points   []redditPoint `json:"points"`
}

func (a *api) redditTimeline(r *core.RequestEvent) error {
	if !validInsightQuery(r) {
		return r.Error(http.StatusBadRequest, "Invalid query parameters.", nil)
	}
	forms, err := a.forms(r.Request.Context())
	if err != nil {
		return unavailable(r)
	}
	form := r.Request.PathValue("form")
	if forms.details[form] == nil {
		return r.Error(http.StatusNotFound, "Unknown form.", nil)
	}
	description, mapped := redditDescriptions[form]
	series := []redditSeries{}
	if mapped {
		value, err := a.load(r.Request.Context(), "reddit-timelines", func(ctx context.Context) (any, error) { return a.q.RedditTimelines(ctx) })
		if err != nil {
			return unavailable(r)
		}
		index := map[string]int{}
		for _, row := range value.([]db.RedditTimelinesRow) {
			if str(row.Form) != form {
				continue
			}
			key := str(row.CaseType) + ":all"
			if row.Premium != nil {
				if *row.Premium {
					key = str(row.CaseType) + ":premium"
				} else {
					key = str(row.CaseType) + ":regular"
				}
			}
			i, ok := index[key]
			if !ok {
				i = len(series)
				index[key] = i
				series = append(series, redditSeries{row.CaseType, row.Premium, []redditPoint{}})
			}
			series[i].Points = append(series[i].Points, redditPoint{date(row.FiledMonth), row.ApprovedReports, row.P10Days, row.P50Days, row.P90Days, date(row.QuarterStart), row.ProcessingMonths})
		}
	}
	var official *string
	if mapped {
		official = &description
	}
	return insightSuccess(r, struct {
		OfficialDescription *string        `json:"officialDescription"`
		Series              []redditSeries `json:"series"`
	}{official, series}, 200*1024)
}

type discussionPoint struct {
	Month    *string `json:"month"`
	Topic    *string `json:"topic"`
	Posts    *int32  `json:"posts"`
	Comments *int32  `json:"comments"`
}
type discussionResponse struct {
	From    *string           `json:"from"`
	Through *string           `json:"through"`
	Months  []discussionPoint `json:"months"`
}

func (a *api) redditDiscussion(r *core.RequestEvent) error {
	if !validInsightQuery(r) {
		return r.Error(http.StatusBadRequest, "Invalid query parameters.", nil)
	}
	value, err := a.load(r.Request.Context(), "reddit-discussion", func(ctx context.Context) (any, error) {
		rows, err := a.q.RedditDiscussion(ctx)
		if err != nil {
			return nil, err
		}
		coverage, err := a.q.RedditCoverage(ctx)
		if err != nil {
			return nil, err
		}
		out := discussionResponse{From: date(coverage.FirstDay), Through: date(coverage.LastDay), Months: []discussionPoint{}}
		for _, row := range rows {
			out.Months = append(out.Months, discussionPoint{date(row.Month), row.Topic, row.Posts, row.Comments})
		}
		return out, nil
	})
	if err != nil {
		return unavailable(r)
	}
	return insightSuccess(r, value, 200*1024)
}

type talkPoint struct {
	Month           *string `json:"month"`
	H1bPosts        *int32  `json:"h1bPosts"`
	H1bComments     *int32  `json:"h1bComments"`
	LotteryPosts    *int32  `json:"lotteryPosts"`
	LotteryComments *int32  `json:"lotteryComments"`
	LcaCases        *int32  `json:"lcaCases"`
	LcaCertified    *int32  `json:"lcaCertified"`
}
type talkResponse struct {
	From    *string     `json:"from"`
	Through *string     `json:"through"`
	Months  []talkPoint `json:"months"`
}

func (a *api) redditH1bTalk(r *core.RequestEvent) error {
	if !validInsightQuery(r) {
		return r.Error(http.StatusBadRequest, "Invalid query parameters.", nil)
	}
	value, err := a.load(r.Request.Context(), "reddit-h1b-talk", func(ctx context.Context) (any, error) {
		rows, err := a.q.RedditH1bTalk(ctx)
		if err != nil {
			return nil, err
		}
		coverage, err := a.q.RedditCoverage(ctx)
		if err != nil {
			return nil, err
		}
		out := talkResponse{From: date(coverage.FirstDay), Through: date(coverage.LastDay), Months: []talkPoint{}}
		for _, row := range rows {
			out.Months = append(out.Months, talkPoint{date(row.Month), row.H1bPosts, row.H1bComments, row.LotteryPosts, row.LotteryComments, row.LcaCases, row.LcaCertified})
		}
		return out, nil
	})
	if err != nil {
		return unavailable(r)
	}
	return insightSuccess(r, value, 200*1024)
}
