package uscis

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strings"
	"time"

	"gongu/internal/uscis/db"
)

type agentItem struct {
	view map[string]any
	refs map[string]agentReference
}

var errAgentAmbiguous = fmt.Errorf("ambiguous selection")

func agentString(v map[string]any, k string) string { s, _ := v[k].(string); return s }
func agentSourceFor(label, href string) agentSource {
	return agentSource{ID: slug(href), Label: agentLabel(label), Href: href}
}
func agentFiscal(p point) string { return fmt.Sprintf("FY %d quarter %d", *p.FiscalYear, *p.Quarter) }
func agentDate(s, layout string) bool {
	d, e := time.Parse(layout, s)
	return e == nil && d.Format(layout) == s
}

func validateAgentArgs(name, raw string) (map[string]any, error) {
	schema, ok := agentSchemas[name]
	if !ok || name == "answer" {
		return nil, errAgentDraft
	}
	v, err := validateAgentJSON(raw, schema)
	if err != nil {
		return nil, err
	}
	// Optional text fields accept an empty string as an omitted filter.
	// Validate first so required fields and unknown keys still fail closed.
	for key, value := range v {
		if value == "" {
			delete(v, key)
		}
	}
	switch name {
	case "forms":
		if agentString(v, "form") == "" && (v["series"] != nil || v["fiscalYear"] != nil || v["quarter"] != nil) {
			return nil, errAgentDraft
		}
		if _, ok := v["quarter"]; ok && v["fiscalYear"] == nil {
			return nil, errAgentDraft
		}
	case "estimate_date":
		if !agentDate(agentString(v, "filingDate"), "2006-01-02") {
			return nil, errAgentDraft
		}
	case "reddit_timelines":
		if c, ok := v["caseType"]; ok && redditCaseLabels[c.(string)] == "" {
			return nil, errAgentDraft
		}
	case "bulletin":
		if agentString(v, "month") == "latest" {
			delete(v, "month")
		}
		if m := agentString(v, "month"); m != "" && !agentDate(m, "2006-01") {
			return nil, errAgentDraft
		}
	}
	return v, nil
}

func (a *api) agentRead(ctx context.Context, f *agentFacts, name string, v map[string]any) (string, error) {
	var items []agentItem
	var err error
	switch name {
	case "forms", "estimate_date":
		items, err = a.agentForms(ctx, f, name, v)
	case "community_timelines":
		items, err = a.agentCommunity(ctx, f, v)
	case "bulletin":
		items, err = a.agentBulletin(ctx, f, v)
	case "reddit_timelines":
		items, err = a.agentReddit(ctx, f, v)
	default:
		return "", errAgentDraft
	}
	if err != nil {
		return "", err
	}
	// Catalogs and series options can be filtered and paged without raising caps.
	offset := 0
	if name == "forms" {
		if n, ok := v["offset"].(float64); ok {
			offset = min(int(n), len(items))
			items = items[offset:]
		}
	}
	// Register only the references actually delivered to the provider.
	envelope := map[string]any{"items": []map[string]any{}, "truncated": false, "omitted": len(items), "nextOffset": nil}
	views := []map[string]any{}
	included := 0
	// Leave room for a repair tool message within the combined byte limit.
	cap := min(1200, 2800-f.bytes)
	for i, item := range items {
		encoded, err := json.Marshal(item.view)
		if err != nil {
			return "", err
		}
		var view map[string]any
		if err := json.Unmarshal(encoded, &view); err != nil {
			return "", err
		}
		if err := normalizeAgentValue(view); err != nil {
			return "", err
		}
		item.view = view
		trial := append(append([]map[string]any{}, views...), item.view)
		envelope["items"], envelope["omitted"], envelope["truncated"] = trial, len(items)-i-1, i+1 < len(items)
		if name == "forms" && i+1 < len(items) {
			envelope["nextOffset"] = offset + i + 1
		} else {
			envelope["nextOffset"] = nil
		}
		data, err := json.Marshal(envelope)
		if err != nil {
			return "", err
		}
		if len(data) > cap {
			break
		}
		views = trial
		included++
		f.remember(item.view)
		for id, ref := range item.refs {
			f.refs[id] = ref
		}
	}
	envelope["items"], envelope["omitted"], envelope["truncated"] = views, len(items)-included, included < len(items)
	if name == "forms" && included < len(items) {
		envelope["nextOffset"] = offset + included
	} else {
		envelope["nextOffset"] = nil
	}
	data, err := json.Marshal(envelope)
	if err != nil {
		return "", err
	}
	if len(data) > cap {
		return "", errAgentDraft
	}
	f.bytes += len(data)
	return string(data), nil
}

func (a *api) agentForms(ctx context.Context, f *agentFacts, name string, v map[string]any) ([]agentItem, error) {
	data, err := a.forms(ctx)
	if err != nil {
		return nil, err
	}
	form := agentString(v, "form")
	query := strings.ToLower(agentString(v, "query"))
	if form == "" {
		items := []agentItem{}
		for _, summary := range data.Forms {
			if !strings.Contains(strings.ToLower(summary.Form+" "+summary.Name), query) {
				continue
			}
			row := map[string]any{"form": summary.Form, "name": agentLabel(summary.Name), "period": fmt.Sprintf("FY %d quarter %d", *summary.LatestPeriod.FiscalYear, *summary.LatestPeriod.Quarter)}
			id := f.id("r")
			items = append(items, agentItem{map[string]any{"rowRef": id, "row": row}, map[string]agentReference{id: {row: row, group: "catalog", source: agentSourceFor("USCIS official statistics", "/trends?form="+url.QueryEscape(summary.Form))}}})
		}
		return items, nil
	}
	detail := data.details[form]
	if detail == nil {
		return nil, errAgentAmbiguous
	}
	selected := agentString(v, "series")
	var series *official
	if selected == "" && (len(detail.Official) != 1 || query != "") {
		items := []agentItem{}
		for _, option := range detail.Official {
			if !strings.Contains(strings.ToLower(option.Label+" "+option.Description), query) {
				continue
			}
			var latest *point
			for i := range option.Points {
				p := &option.Points[i]
				if latest == nil || *p.FiscalYear > *latest.FiscalYear || (*p.FiscalYear == *latest.FiscalYear && *p.Quarter > *latest.Quarter) {
					latest = p
				}
			}
			row := map[string]any{"form": form, "series": option.ID, "label": agentLabel(option.Label), "period": agentFiscal(*latest)}
			id := f.id("r")
			items = append(items, agentItem{map[string]any{"rowRef": id, "row": row}, map[string]agentReference{id: {row: row, group: "series", source: agentSourceFor("USCIS official statistics", "/trends?form="+url.QueryEscape(form))}}})
		}
		return items, nil
	}
	for _, s := range detail.Official {
		if s.ID == selected || selected == "" {
			series = s
			break
		}
	}
	if series == nil {
		return nil, errAgentAmbiguous
	}
	source := agentSourceFor("USCIS official statistics", "/trends?form="+url.QueryEscape(form))
	if name == "estimate_date" {
		var latest *point
		for i := range series.Points {
			p := &series.Points[i]
			if p.ProcessingMonths != nil && *p.ProcessingMonths > 0 && p.FiscalYear != nil && p.Quarter != nil && (latest == nil || *p.FiscalYear > *latest.FiscalYear || (*p.FiscalYear == *latest.FiscalYear && *p.Quarter > *latest.Quarter)) {
				latest = p
			}
		}
		if latest == nil || math.IsNaN(*latest.ProcessingMonths) || math.IsInf(*latest.ProcessingMonths, 0) {
			return nil, nil
		}
		filed, _ := time.Parse("2006-01-02", agentString(v, "filingDate"))
		// JavaScript Date clips fractional milliseconds before ISO formatting.
		millis := float64(filed.UnixMilli()) + *latest.ProcessingMonths*30.44*86400000
		if math.Abs(millis) > 8640000000000000 {
			return nil, nil
		}
		estimated := time.UnixMilli(int64(millis)).UTC().Format("2006-01-02")
		if len(estimated) != 10 {
			return nil, nil
		}
		block := map[string]any{"type": "date_estimate", "form": form, "series": agentLabel(series.Label), "filingDate": agentString(v, "filingDate"), "medianMonths": *latest.ProcessingMonths, "estimatedDate": estimated, "period": agentFiscal(*latest), "sourceId": source.ID}
		id := f.id("e")
		return []agentItem{{map[string]any{"estimateRef": id, "estimate": block}, map[string]agentReference{id: {block: block, source: source}}}}, nil
	}
	points := append([]point{}, series.Points...)
	sort.Slice(points, func(i, j int) bool {
		if *points[i].FiscalYear == *points[j].FiscalYear {
			return *points[i].Quarter > *points[j].Quarter
		}
		return *points[i].FiscalYear > *points[j].FiscalYear
	})
	items := []agentItem{}
	for _, p := range points {
		if fy, ok := v["fiscalYear"].(float64); ok && int32(fy) != *p.FiscalYear {
			continue
		}
		if q, ok := v["quarter"].(float64); ok && int32(q) != *p.Quarter {
			continue
		}
		per := agentFiscal(p)
		row := map[string]any{"form": form, "series": series.ID, "label": agentLabel(detail.Name) + ", " + agentLabel(series.Label), "period": per, "received": p.Received, "approved": p.Approved, "denied": p.Denied, "completed": p.Completed, "pending": p.Pending, "processingMonths": p.ProcessingMonths}
		id := f.id("r")
		refs := map[string]agentReference{id: {row: row, group: "official", source: source}}
		factRefs := map[string]string{}
		for _, metric := range []string{"received", "approved", "denied", "completed", "pending", "processingMonths"} {
			fact := f.id("f")
			factRefs[metric] = fact
			unit := "cases"
			metricLabel := agentColumnLabels[metric]
			if metric == "processingMonths" {
				unit = "months"
				metricLabel = "Reported median"
			}
			if metric == "completed" {
				metricLabel = "Completed cases"
			}
			block := map[string]any{"type": "stat", "label": row["label"].(string) + ", " + metricLabel, "value": row[metric], "unit": unit, "period": per, "sourceId": source.ID}
			refs[fact] = agentReference{block: block, source: source}
		}
		items = append(items, agentItem{map[string]any{"rowRef": id, "row": row, "factRefs": factRefs}, refs})
	}
	return items, nil
}

func (a *api) agentCommunity(ctx context.Context, f *agentFacts, v map[string]any) ([]agentItem, error) {
	form := agentString(v, "form")
	stage, ok := stages[form]
	if !ok {
		return nil, errAgentAmbiguous
	}
	value, err := a.communityRows(ctx)
	if err != nil {
		return nil, err
	}
	items := []agentItem{}
	for _, r := range value.([]db.CommunityRow) {
		if str(r.Stage) != stage[0] || str(r.VisaType) != agentString(v, "visaType") || r.FilingYear == nil || *r.FilingYear != int32(v["filingYear"].(float64)) {
			continue
		}
		row := map[string]any{"form": form, "visaType": agentLabel(str(r.VisaType)), "filingYear": r.FilingYear, "sampleSize": r.SampleSize, "completed": r.CompletedCount, "pending": r.PendingCount, "pendingShare": r.PendingShare, "p10": r.P10Days, "p50": r.P50Days, "p90": r.P90Days, "meaning": agentLabel(stage[1]) + ". Percentiles describe completed reports only."}
		id := f.id("r")
		source := agentSourceFor("VisaJourney self-reported timelines, "+form+", "+str(r.VisaType)+", "+stage[1], "/trends?form="+url.QueryEscape(form))
		cohort := fmt.Sprintf("Filing cohort %d", *r.FilingYear)
		source.Period = &cohort
		source.ID = slug(source.Href + "visajourney" + str(r.VisaType) + cohort)
		items = append(items, agentItem{map[string]any{"rowRef": id, "row": row}, map[string]agentReference{id: {row: row, group: "community", source: source}}})
	}
	return items, nil
}

var redditCaseLabels = map[string]string{"opt": "OPT", "stem_opt": "STEM OPT", "h1b": "H-1B", "h1b_change_of_status": "H-1B change of status", "h1b_transfer": "H-1B transfer", "h1b_extension": "H-1B extension", "i140": "I-140"}

var redditProcessingLabels = map[string]string{"all": "All", "premium": "Premium", "regular": "Regular"}

// Days to months as the trends page shows them, at one decimal.
func redditMonths(days *float64) *float64 {
	if days == nil {
		return nil
	}
	months := math.Round(*days/30.44*10) / 10
	return &months
}

func redditProcessing(premium *bool) string {
	if premium == nil {
		return "all"
	}
	if *premium {
		return "premium"
	}
	return "regular"
}

// One row per case type and processing: the newest cohort matched to a USCIS
// quarter, else the newest cohort, as the trends page headline shows.
func (a *api) agentReddit(ctx context.Context, f *agentFacts, v map[string]any) ([]agentItem, error) {
	value, err := a.redditRows(ctx)
	if err != nil {
		return nil, err
	}
	form, caseType, processing := agentString(v, "form"), agentString(v, "caseType"), agentString(v, "processing")
	latest, order := map[string]db.RedditTimelinesRow{}, []string{}
	for _, r := range value.([]db.RedditTimelinesRow) {
		if str(r.Form) != form || r.P50Days == nil || !r.FiledMonth.Valid || (caseType != "" && str(r.CaseType) != caseType) || (processing != "" && redditProcessing(r.Premium) != processing) {
			continue
		}
		key := str(r.CaseType) + "|" + redditProcessing(r.Premium)
		best, seen := latest[key]
		if !seen {
			order = append(order, key)
		}
		matched, bestMatched := r.QuarterStart.Valid && r.ProcessingMonths != nil, best.QuarterStart.Valid && best.ProcessingMonths != nil
		if !seen || (matched && !bestMatched) || (matched == bestMatched && r.FiledMonth.Time.After(best.FiledMonth.Time)) {
			latest[key] = r
		}
	}
	items := []agentItem{}
	for _, key := range order {
		r := latest[key]
		caseLabel := redditCaseLabels[str(r.CaseType)]
		if caseLabel == "" {
			caseLabel = "Not stated"
		}
		processingLabel := redditProcessingLabels[redditProcessing(r.Premium)]
		filed := r.FiledMonth.Time.Format("2006-01")
		row := map[string]any{"form": form, "caseType": caseLabel, "processing": processingLabel, "filedMonth": filed, "approvedReports": r.ApprovedReports, "lowMonths": redditMonths(r.P10Days), "medianMonths": redditMonths(r.P50Days), "highMonths": redditMonths(r.P90Days), "meaning": "Reddit self-reported months, filed to approved. Low and high are the 10th and 90th percentiles of approved reports only; recent months skew short."}
		label := "Reddit, " + caseLabel + ", " + processingLabel
		source := agentSourceFor("Reddit self-reported timelines, "+form+", "+caseLabel+", "+processingLabel, "/trends?form="+url.QueryEscape(form))
		period := "Filed " + filed
		source.Period = &period
		source.ID = slug(source.Href + "reddit" + key + filed)
		rowID, factID := f.id("r"), f.id("f")
		median := map[string]any{"type": "stat", "label": label + ", Reported median", "value": redditMonths(r.P50Days), "unit": "months", "period": period, "sourceId": source.ID}
		items = append(items, agentItem{map[string]any{"rowRef": rowID, "row": row, "factRefs": map[string]string{"medianMonths": factID}}, map[string]agentReference{rowID: {row: row, group: "reddit", source: source}, factID: {block: median, source: source}}})
	}
	return items, nil
}

func (a *api) agentBulletin(ctx context.Context, f *agentFacts, v map[string]any) ([]agentItem, error) {
	value, err := a.bulletinRows(ctx)
	if err != nil {
		return nil, err
	}
	var selected *db.BulletinRow
	month := agentString(v, "month")
	for _, r := range value.([]db.BulletinRow) {
		if str(r.CategoryCode) != agentString(v, "category") || str(r.CountryCode) != agentString(v, "country") || str(r.Chart) != agentString(v, "chart") || !r.BulletinMonth.Valid {
			continue
		}
		if month != "" && r.BulletinMonth.Time.Format("2006-01") != month {
			continue
		}
		if selected == nil || r.BulletinMonth.Time.After(selected.BulletinMonth.Time) {
			copy := r
			selected = &copy
		}
	}
	if selected == nil {
		return nil, nil
	}
	r := selected
	status := "date"
	var cutoff *string
	if r.IsCurrent != nil && *r.IsCurrent {
		status = "current"
	} else if r.IsUnavailable != nil && *r.IsUnavailable {
		status = "unavailable"
	} else {
		cutoff = date(r.CutoffDate)
		if cutoff == nil {
			return nil, nil
		}
	}
	source := agentSourceFor("DOS visa bulletin", "/bulletin?"+url.Values{"category": {str(r.CategoryCode)}, "chart": {str(r.Chart)}, "country": {str(r.CountryCode)}}.Encode())
	block := map[string]any{"type": "bulletin_cutoff", "category": agentLabel(str(r.CategoryCode)), "country": agentLabel(str(r.CountryCode)), "chart": str(r.Chart), "month": r.BulletinMonth.Time.Format("2006-01"), "status": status, "cutoff": cutoff, "sourceId": source.ID}
	id := f.id("c")
	return []agentItem{{map[string]any{"cutoffRef": id, "cutoff": block}, map[string]agentReference{id: {block: block, source: source}}}}, nil
}
