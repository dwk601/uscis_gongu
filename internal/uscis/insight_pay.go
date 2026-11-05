package uscis

import (
	"context"
	"net/http"
	"strconv"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"gongu/internal/uscis/db"
)

type payTitle struct {
	Key   string `json:"key"`
	Title string `json:"title"`
	Cases int32  `json:"cases"`
}
type payYear struct {
	Year   int32      `json:"year"`
	From   string     `json:"from"`
	To     string     `json:"to"`
	Titles []payTitle `json:"titles"`
}
type payCatalog struct {
	Years []payYear `json:"years"`
}
type payBox struct {
	Cases *int32   `json:"cases"`
	P10   *float64 `json:"p10"`
	P25   *float64 `json:"p25"`
	P50   *float64 `json:"p50"`
	P75   *float64 `json:"p75"`
	P90   *float64 `json:"p90"`
}
type payState struct {
	State string `json:"state"`
	payBox
}
type payDetail struct {
	Year   int32      `json:"year"`
	Key    string     `json:"key"`
	Title  string     `json:"title"`
	All    payBox     `json:"all"`
	States []payState `json:"states"`
}

func buildPayCatalog(rows []db.PayCatalogRow) payCatalog {
	out := payCatalog{Years: []payYear{}}
	for _, r := range rows {
		if r.FiscalYear == nil || r.TitleKey == nil || r.JobTitle == nil || r.Cases == nil || !r.FirstReceived.Valid || !r.LastReceived.Valid {
			continue
		}
		from := *date(r.FirstReceived)
		to := *date(r.LastReceived)
		if len(out.Years) == 0 || out.Years[len(out.Years)-1].Year != *r.FiscalYear {
			out.Years = append(out.Years, payYear{Year: *r.FiscalYear, From: from, To: to, Titles: []payTitle{}})
		}
		y := &out.Years[len(out.Years)-1]
		if from < y.From {
			y.From = from
		}
		if to > y.To {
			y.To = to
		}
		y.Titles = append(y.Titles, payTitle{*r.TitleKey, *r.JobTitle, *r.Cases})
	}
	return out
}
func (a *api) pay(r *core.RequestEvent) error {
	if !validInsightQuery(r, "year", "title") {
		return r.Error(http.StatusBadRequest, "Invalid query parameters.", nil)
	}
	params := r.Request.URL.Query()
	hasYear, hasTitle := params.Has("year"), params.Has("title")
	if hasYear != hasTitle {
		return r.Error(http.StatusBadRequest, "Invalid year or title.", nil)
	}
	var year int32
	key := params.Get("title")
	if hasYear {
		n, err := strconv.ParseInt(params.Get("year"), 10, 32)
		if err != nil || key == "" {
			return r.Error(http.StatusBadRequest, "Invalid year or title.", nil)
		}
		year = int32(n)
	}
	value, err := a.load(r.Request.Context(), "pay-catalog", func(ctx context.Context) (any, error) {
		rows, err := a.q.PayCatalog(ctx)
		if err != nil {
			return nil, err
		}
		return buildPayCatalog(rows), nil
	})
	if err != nil {
		return unavailable(r)
	}
	catalog := value.(payCatalog)
	if !hasYear {
		return insightSuccess(r, catalog)
	}
	title := ""
	found := false
	for _, y := range catalog.Years {
		if y.Year == year {
			for _, t := range y.Titles {
				if t.Key == key {
					found = true
					title = t.Title
					break
				}
			}
		}
	}
	if !found {
		return r.Error(http.StatusBadRequest, "Invalid year or title.", nil)
	}
	value, err = a.load(r.Request.Context(), "pay-"+strconv.Itoa(int(year))+"-"+key, func(ctx context.Context) (any, error) {
		return a.q.PayTitle(ctx, db.PayTitleParams{FiscalYear: &year, TitleKey: &key})
	})
	if err != nil {
		return unavailable(r)
	}
	out := payDetail{Year: year, Key: key, Title: title, States: []payState{}}
	hasAll := false
	for _, row := range value.([]db.PayTitleRow) {
		box := payBox{row.Cases, row.P10, row.P25, row.P50, row.P75, row.P90}
		if row.WorksiteState == nil {
			out.All = box
			hasAll = true
		} else {
			out.States = append(out.States, payState{*row.WorksiteState, box})
		}
	}
	if !hasAll {
		return unavailable(r)
	}
	return insightSuccess(r, out)
}
