package uscis

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
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
func describedText(description string) agentSchema {
	s := text()
	s["description"] = description
	return s
}
func paragraphText() agentSchema {
	s := text()
	s["maxLength"] = 400
	return s
}
func integer(low, high int) agentSchema {
	return agentSchema{"type": "integer", "minimum": low, "maximum": high}
}
func array(items agentSchema, low, high int) agentSchema {
	return agentSchema{"type": "array", "items": items, "minItems": low, "maxItems": high}
}

var agentSchemas = map[string]agentSchema{
	"forms":               object(map[string]agentSchema{"form": text(), "series": text(), "query": text(), "offset": integer(0, 10000), "fiscalYear": integer(1900, 2200), "quarter": integer(1, 4)}),
	"estimate_date":       object(map[string]agentSchema{"form": text(), "series": text(), "filingDate": text()}, "form", "series", "filingDate"),
	"community_timelines": object(map[string]agentSchema{"form": text(), "visaType": describedText("VisaJourney codes: F-1, IR-1/CR-1, K1, K3, Other. Use the exact code."), "filingYear": integer(1900, 2200)}, "form", "visaType", "filingYear"),
	"bulletin":            object(map[string]agentSchema{"category": describedText("DOS codes: F1, F2A, F2B, F3, F4, EB1, EB2, EB3, EB3-OW, EB4, EB4-RELIGIOUS, EB5-NON-RC, EB5-RC, EB5-SET-ASIDE-HIGH-UNEMPLOYMENT, EB5-SET-ASIDE-INFRASTRUCTURE, EB5-SET-ASIDE-RURAL, EB5-UNRESERVED, EB5-UNRESERVED-RC."), "country": describedText("Country codes: ALL for all other countries, INDIA, CHINA, MEXICO, PHILIPPINES, EL SALVADOR GUATEMALA HONDURAS. Do not use IN or ROW."), "chart": text("final_action", "dates_for_filing"), "month": text()}, "category", "country", "chart"),
	"answer": object(map[string]agentSchema{
		"kind": text("answer", "refusal", "clarification", "no_data"),
		"blocks": array(agentSchema{"oneOf": []agentSchema{
			object(map[string]agentSchema{"type": text("paragraph"), "text": paragraphText()}, "type", "text"),
			object(map[string]agentSchema{"type": text("stat"), "factRef": text()}, "type", "factRef"),
			object(map[string]agentSchema{"type": text("table"), "rowRefs": array(text(), 1, 6), "columns": array(text(), 1, 4)}, "type", "rowRefs", "columns"),
			object(map[string]agentSchema{"type": text("date_estimate"), "estimateRef": text()}, "type", "estimateRef"),
			object(map[string]agentSchema{"type": text("bulletin_cutoff"), "cutoffRef": text()}, "type", "cutoffRef"),
		}}, 1, 6),
	}, "kind", "blocks"),
}

var agentToolDescriptions = map[string]string{
	"forms":               "List forms or read official statistics. Use form directly when known. For a multi-series form without series, returns series options with IDs, labels and latest fiscal periods. Select the option matching the question, or name the options in a clarification. query filters catalog names or series labels; offset and nextOffset page within the byte cap. Optional fiscalYear and quarter select a fiscal period. Official columns: form, series, label, period, received, approved, denied, completed, pending, processingMonths. Catalog columns: form, name, label, series, period.",
	"estimate_date":       "Estimate a UTC date from an exact filingDate YYYY-MM-DD and series ID. Uses the latest positive reported official median, not a personalized forecast or USCIS commitment.",
	"community_timelines": "VisaJourney self-reported timelines for an explicit form, visaType and filingYear cohort. Percentiles describe completed reports only. Table columns: form, visaType, filingYear, sampleSize, completed, pending, pendingShare, p10, p50, p90, meaning. Keep nulls. Community tables must include sampleSize and completed columns.",
	"bulletin":            "DOS visa bulletin for an explicit category, country code and chart. Optional month YYYY-MM; otherwise latest. Current and unavailable are not cutoff dates.",
	"answer":              "Finish only with this tool. Explain the data in one to three short plain paragraphs, at most four paragraphs of 400 characters each. Use {{factRef}} for a formatted stat, {{estimateRef}} for an estimated date, {{cutoffRef}} for a cutoff or status, or {{rowRef.label}} and {{ref.field}} for scalar fields. The server fills placeholders and structured blocks. Never author counts, dates, labels, URLs or table cells. Digits outside placeholders are allowed only in identifiers such as I-485 or EB2 present in executed results. Use clarification for ambiguity, no_data for empty results, refusal for off-topic questions.",
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
	value, err := decodeAgentJSON([]byte(raw))
	if len(raw) > 8192 || err != nil || !schemaAccepts(schema, value) {
		return nil, errAgentDraft
	}
	return value.(map[string]any), nil
}

// Token decoding catches duplicate keys at any depth before maps can discard them.
func decodeAgentJSON(raw []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	var value func() (any, error)
	value = func() (any, error) {
		token, err := dec.Token()
		if err != nil {
			return nil, err
		}
		switch token {
		case json.Delim('{'):
			out := map[string]any{}
			for dec.More() {
				key, err := dec.Token()
				if err != nil {
					return nil, err
				}
				name, ok := key.(string)
				if !ok {
					return nil, errAgentDraft
				}
				if _, duplicate := out[name]; duplicate {
					return nil, errAgentDraft
				}
				child, err := value()
				if err != nil {
					return nil, err
				}
				out[name] = child
			}
			end, err := dec.Token()
			if err != nil || end != json.Delim('}') {
				return nil, errAgentDraft
			}
			return out, nil
		case json.Delim('['):
			out := []any{}
			for dec.More() {
				child, err := value()
				if err != nil {
					return nil, err
				}
				out = append(out, child)
			}
			end, err := dec.Token()
			if err != nil || end != json.Delim(']') {
				return nil, errAgentDraft
			}
			return out, nil
		case json.Delim('}'), json.Delim(']'):
			return nil, errAgentDraft
		default:
			return token, nil
		}
	}
	out, err := value()
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errAgentDraft
	}
	return out, nil
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
