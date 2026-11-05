package uscis

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"gongu/internal/uscis/db"
)

type employer struct {
	Name                string `json:"name"`
	InitialApprovals    int64  `json:"initialApprovals"`
	InitialDenials      int64  `json:"initialDenials"`
	ContinuingApprovals int64  `json:"continuingApprovals"`
}

type employersResponse struct {
	Years     []int32    `json:"years"`
	Year      *int32     `json:"year"`
	Employers []employer `json:"employers"`
}

func (a *api) employers(r *core.RequestEvent) error {
	if !validInsightQuery(r, "year") {
		return r.Error(http.StatusBadRequest, "Invalid query parameters.", nil)
	}
	ctx, cancel := context.WithTimeout(r.Request.Context(), 5*time.Second)
	defer cancel()
	value, err := a.load(ctx, "employer-years", func(ctx context.Context) (any, error) { return a.q.EmployerYears(ctx) })
	if err != nil {
		return unavailable(r)
	}
	var years []int32
	for _, year := range value.([]*int32) {
		if year != nil {
			years = append(years, *year)
		}
	}
	years = append([]int32{}, years...)
	var year int32
	if len(years) > 0 {
		year = years[0]
	}
	params := r.Request.URL.Query()
	if params.Has("year") {
		n, err := strconv.ParseInt(params.Get("year"), 10, 32)
		if err != nil {
			return r.Error(http.StatusBadRequest, "Invalid year.", nil)
		}
		year = int32(n)
	}
	found := false
	for _, y := range years {
		if y == year {
			found = true
			break
		}
	}
	if !found && params.Has("year") {
		return r.Error(http.StatusBadRequest, "Invalid year.", nil)
	}
	out := employersResponse{Years: years, Employers: []employer{}}
	if !found {
		return insightSuccess(r, out)
	}
	out.Year = &year
	value, err = a.load(ctx, "employers-"+strconv.Itoa(int(year)), func(ctx context.Context) (any, error) { return a.q.Employers(ctx, &year) })
	if err != nil {
		return unavailable(r)
	}
	for _, row := range value.([]db.EmployersRow) {
		out.Employers = append(out.Employers, employer{str(row.EmployerName), row.InitialApprovals, row.InitialDenials, row.ContinuingApprovals})
	}
	return insightSuccess(r, out)
}
