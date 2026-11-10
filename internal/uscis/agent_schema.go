package uscis

import (
	"encoding/json"
	"errors"
	"math"
	"unicode/utf8"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/shared"
)

type agentSchema map[string]any

func object(properties map[string]agentSchema, required ...string) agentSchema {
	if required == nil {
		required = []string{}
	}
	return agentSchema{"type": "object", "properties": properties, "required": required, "additionalProperties": false}
}
func text(values ...string) agentSchema {
	s := agentSchema{"type": "string", "minLength": 1, "maxLength": 320}
	if len(values) > 0 {
		s["enum"] = values
	}
	return s
}
func integer(low, high int) agentSchema {
	return agentSchema{"type": "integer", "minimum": low, "maximum": high}
}
func array(items agentSchema, low, high int) agentSchema {
	return agentSchema{"type": "array", "items": items, "minItems": low, "maxItems": high}
}

var agentSchemas = map[string]agentSchema{
	"forms":               object(map[string]agentSchema{"form": text(), "series": text(), "fiscalYear": integer(1900, 2200), "quarter": integer(1, 4)}),
	"estimate_date":       object(map[string]agentSchema{"form": text(), "series": text(), "filingDate": text()}, "form", "series", "filingDate"),
	"community_timelines": object(map[string]agentSchema{"form": text(), "visaType": text(), "filingYear": integer(1900, 2200)}, "form", "visaType", "filingYear"),
	"bulletin":            object(map[string]agentSchema{"category": text(), "country": text(), "chart": text("final_action", "dates_for_filing"), "month": text()}, "category", "country", "chart"),
	"answer": object(map[string]agentSchema{
		"kind": text("answer", "refusal", "clarification", "no_data"),
		"blocks": array(agentSchema{"oneOf": []agentSchema{
			object(map[string]agentSchema{"type": text("paragraph"), "text": text()}, "type", "text"),
			object(map[string]agentSchema{"type": text("stat"), "factRef": text()}, "type", "factRef"),
			object(map[string]agentSchema{"type": text("table"), "rowRefs": array(text(), 1, 6), "columns": array(text(), 1, 4)}, "type", "rowRefs", "columns"),
			object(map[string]agentSchema{"type": text("date_estimate"), "estimateRef": text()}, "type", "estimateRef"),
			object(map[string]agentSchema{"type": text("bulletin_cutoff"), "cutoffRef": text()}, "type", "cutoffRef"),
		}}, 1, 6),
	}, "kind", "blocks"),
}

var agentToolDescriptions = map[string]string{
	"forms":               "Without a form, list the catalog and series IDs. With a form, select an explicit series if several exist; optional fiscalYear and quarter select a fiscal period. Rows contain factRefs for stat blocks. Official table columns: form, series, label, period, received, approved, denied, completed, pending, processingMonths. Catalog columns: form, name, series.",
	"estimate_date":       "Estimate a UTC date from an exact filingDate YYYY-MM-DD and series ID. Uses the latest positive reported official median, not a personalized forecast or USCIS commitment.",
	"community_timelines": "VisaJourney self-reported timelines for an explicit form, visaType and filingYear cohort. Percentiles describe completed reports only. Table columns: form, visaType, filingYear, sampleSize, completed, pending, pendingShare, p10, p50, p90, meaning. Keep nulls. Community tables must include sampleSize and completed columns.",
	"bulletin":            "DOS visa bulletin for an explicit category, country code and chart. Optional month YYYY-MM; otherwise latest. Current and unavailable are not cutoff dates.",
	"answer":              "Finish only with this tool. Choose kind and reference-only blocks. Never supply labels, values, dates, units, URLs, or table cells. Paragraphs are short connective prose without numbers, dates, URLs or factual claims. Use clarification for ambiguous selections, no_data for empty results, refusal for off-topic questions.",
}

func agentTools(terminal bool) []openai.ChatCompletionToolUnionParam {
	names := []string{"forms", "estimate_date", "community_timelines", "bulletin", "answer"}
	if terminal {
		names = []string{"answer"}
	}
	out := make([]openai.ChatCompletionToolUnionParam, 0, len(names))
	for _, name := range names {
		out = append(out, openai.ChatCompletionToolUnionParam{OfFunction: &openai.ChatCompletionFunctionToolParam{Function: shared.FunctionDefinitionParam{Name: name, Description: openai.String(agentToolDescriptions[name]), Parameters: shared.FunctionParameters(agentSchemas[name])}}})
	}
	return out
}

var errAgentDraft = errors.New("invalid agent selection")
var errAgentStyle = errors.New("invalid answer style")

// This is the same schema sent to the provider. Validation does not depend on
// provider support for strict tool calls.
func validateAgentJSON(raw string, schema agentSchema) (map[string]any, error) {
	var value any
	if len(raw) > 8192 || json.Unmarshal([]byte(raw), &value) != nil || !schemaAccepts(schema, value) {
		return nil, errAgentDraft
	}
	return value.(map[string]any), nil
}
func schemaAccepts(s agentSchema, value any) bool {
	if choices, ok := s["oneOf"].([]agentSchema); ok {
		matches := 0
		for _, choice := range choices {
			if schemaAccepts(choice, value) {
				matches++
			}
		}
		return matches == 1
	}
	switch s["type"] {
	case "object":
		v, ok := value.(map[string]any)
		if !ok {
			return false
		}
		properties := s["properties"].(map[string]agentSchema)
		for k, x := range v {
			child, ok := properties[k]
			if !ok || !schemaAccepts(child, x) {
				return false
			}
		}
		for _, k := range s["required"].([]string) {
			if _, ok := v[k]; !ok {
				return false
			}
		}
	case "array":
		v, ok := value.([]any)
		if !ok || len(v) < s["minItems"].(int) || len(v) > s["maxItems"].(int) {
			return false
		}
		for _, x := range v {
			if !schemaAccepts(s["items"].(agentSchema), x) {
				return false
			}
		}
	case "string":
		v, ok := value.(string)
		if !ok || !utf8.ValidString(v) || utf8.RuneCountInString(v) < s["minLength"].(int) || utf8.RuneCountInString(v) > s["maxLength"].(int) {
			return false
		}
		if choices, ok := s["enum"].([]string); ok {
			for _, x := range choices {
				if x == v {
					return true
				}
			}
			return false
		}
	case "integer":
		v, ok := value.(float64)
		if !ok || math.Trunc(v) != v || v < float64(s["minimum"].(int)) || v > float64(s["maximum"].(int)) {
			return false
		}
	default:
		return false
	}
	return true
}
