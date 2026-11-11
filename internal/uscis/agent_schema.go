package uscis

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/shared"
	"gongu/internal/uscis/db"
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
func optionalText() agentSchema {
	s := text()
	s["minLength"] = 0
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
	"forms":               object(map[string]agentSchema{"form": optionalText(), "series": optionalText(), "query": optionalText(), "offset": integer(0, 10000), "fiscalYear": integer(1900, 2200), "quarter": integer(1, 4)}),
	"estimate_date":       object(map[string]agentSchema{"form": text(), "series": text(), "filingDate": text()}, "form", "series", "filingDate"),
	"community_timelines": object(map[string]agentSchema{"form": text(), "visaType": text(), "filingYear": integer(1900, 2200)}, "form", "visaType", "filingYear"),
	"bulletin":            object(map[string]agentSchema{"category": text(), "country": text(), "chart": text("final_action", "dates_for_filing"), "month": optionalText()}, "category", "country", "chart"),
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
	"forms":               "Catalog; form lists its series; form plus series reads stats. query filters; offset follows nextOffset.",
	"estimate_date":       "Latest positive median times 30.44 UTC days; filingDate YYYY-MM-DD.",
	"community_timelines": "VisaJourney day percentiles. visaType: F-1,IR-1/CR-1,K1,K3,Other.",
	"bulletin":            "DOS; month YYYY-MM or latest. category: F1,F2A,F2B,F3,F4,EB1,EB2,EB3,EB3-OW,EB4,EB4-RELIGIOUS,EB5-NON-RC,EB5-RC,EB5-SET-ASIDE-HIGH-UNEMPLOYMENT,EB5-SET-ASIDE-INFRASTRUCTURE,EB5-SET-ASIDE-RURAL,EB5-UNRESERVED,EB5-UNRESERVED-RC. country: ALL,INDIA,CHINA,MEXICO,PHILIPPINES,EL SALVADOR GUATEMALA HONDURAS.",
	"answer":              "Finish with reference blocks and plain paragraphs.",
}

// Provider hints omit repeated limits; validation retains the full server
// schema, including closed objects, lengths and discriminated blocks.
func agentWireSchema(schema agentSchema) agentSchema {
	out := agentSchema{}
	for key, value := range schema {
		switch key {
		case "minLength", "maxLength", "additionalProperties":
			continue
		case "properties":
			properties := map[string]agentSchema{}
			for name, child := range value.(map[string]agentSchema) {
				properties[name] = agentWireSchema(child)
			}
			out[key] = properties
		case "items":
			out[key] = agentWireSchema(value.(agentSchema))
		case "oneOf":
			choices := []agentSchema{}
			for _, child := range value.([]agentSchema) {
				choices = append(choices, agentWireSchema(child))
			}
			out[key] = choices
		default:
			out[key] = value
		}
	}
	return out
}

var agentCodePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9 ,/.&'-]{0,39}$`)
var agentVisaCodePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9 ,/.&'-]{0,39}$`)

// Only inspect populated, unexpired shared caches. Asking about one dataset
// must not trigger unrelated readers or fail because another view is absent.
func (a *api) agentCodeHints() map[string]string {
	a.mu.Lock()
	community, bulletin := a.cache["community"], a.cache["bulletin"]
	a.mu.Unlock()
	codes := func(values map[string]bool, pattern *regexp.Regexp) string {
		out := make([]string, 0, len(values))
		for value := range values {
			if !pattern.MatchString(value) || agentLink.MatchString(value) {
				return ""
			}
			out = append(out, value)
		}
		sort.Strings(out)
		return strings.Join(out, ",")
	}
	hints := map[string]string{}
	if rows, ok := community.value.([]db.CommunityRow); ok && time.Now().Before(community.expires) {
		visas := map[string]bool{}
		for _, row := range rows {
			visas[str(row.VisaType)] = true
		}
		if values := codes(visas, agentVisaCodePattern); values != "" {
			hints["community_timelines"] = "VisaJourney day percentiles. visaType: " + values + "."
		}
	}
	if rows, ok := bulletin.value.([]db.BulletinRow); ok && time.Now().Before(bulletin.expires) {
		categories, countries := map[string]bool{}, map[string]bool{}
		for _, row := range rows {
			categories[str(row.CategoryCode)] = true
			countries[str(row.CountryCode)] = true
		}
		categoryCodes, countryCodes := codes(categories, agentCodePattern), codes(countries, agentCodePattern)
		if categoryCodes != "" && countryCodes != "" {
			hints["bulletin"] = "DOS; month YYYY-MM or latest. category: " + categoryCodes + ". country: " + countryCodes + "."
		}
	}
	return hints
}

func (a *api) agentTools() []openai.ChatCompletionToolUnionParam {
	names := []string{"forms", "estimate_date", "community_timelines", "bulletin", "answer"}
	hints := a.agentCodeHints()
	out := make([]openai.ChatCompletionToolUnionParam, 0, len(names))
	for _, name := range names {
		description := agentToolDescriptions[name]
		if hint := hints[name]; hint != "" {
			description = hint
		}
		out = append(out, openai.ChatCompletionToolUnionParam{OfFunction: &openai.ChatCompletionFunctionToolParam{Function: shared.FunctionDefinitionParam{Name: name, Description: openai.String(description), Parameters: shared.FunctionParameters(agentWireSchema(agentSchemas[name]))}}})
	}
	// A larger future vocabulary must not inflate the fixed prompt budget.
	if encoded, err := json.Marshal(out); err != nil || len(encoded) > 3000 {
		for _, tool := range out {
			name := tool.OfFunction.Function.Name
			tool.OfFunction.Function.Description = openai.String(agentToolDescriptions[name])
		}
	}
	return out
}

var errAgentDraft = errors.New("invalid agent selection")
var errAgentStyle = errors.New("invalid answer style")

// Validate the full server schema, not the smaller provider hints. Neither
// constraint enforcement nor unknown-field rejection depends on strict tools.
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
