package uscis

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const agentRefusal = "I can only answer questions about USCIS case data on gongu."

type agentSource struct {
	ID     string  `json:"id"`
	Label  string  `json:"label"`
	Href   string  `json:"href"`
	Period *string `json:"period"`
}
type agentResponse struct {
	Kind    string           `json:"kind"`
	Blocks  []map[string]any `json:"blocks"`
	Sources []agentSource    `json:"sources"`
	Budget  agentBudget      `json:"budget"`
}
type agentReference struct {
	block  map[string]any
	row    map[string]any
	group  string
	source agentSource
}
type agentFacts struct {
	refs   map[string]agentReference
	tokens map[string]bool
	next   int
	bytes  int
}

func (f *agentFacts) id(prefix string) string { f.next++; return fmt.Sprintf("%s%d", prefix, f.next) }

var agentColumnLabels = map[string]string{
	"form": "Form", "series": "Series", "name": "Name", "label": "Series label", "period": "Fiscal period",
	"received": "Received cases", "approved": "Approved cases", "denied": "Denied cases", "completed": "Completed", "pending": "Pending", "processingMonths": "Reported median in months",
	"visaType": "Visa type", "filingYear": "Filing year", "sampleSize": "Included reports", "pendingShare": "Pending share", "p10": "Completed reports lower percentile in days", "p50": "Completed reports median in days", "p90": "Completed reports upper percentile in days", "meaning": "Timeline meaning",
}

func (f *agentFacts) resolve(raw string) (*agentResponse, error) {
	v, err := validateAgentJSON(raw, agentSchemas["answer"])
	if err != nil {
		return nil, err
	}
	out := &agentResponse{Kind: v["kind"].(string), Blocks: []map[string]any{}, Sources: []agentSource{}}
	blocks := v["blocks"].([]any)
	if (out.Kind == "refusal" || out.Kind == "clarification") && (len(blocks) != 1 || blocks[0].(map[string]any)["type"] != "paragraph") {
		return nil, errAgentDraft
	}
	seen := map[string]bool{}
	addSource := func(source agentSource) error {
		var err error
		source.Label, err = agentDisplayText(source.Label)
		if err != nil {
			return err
		}
		if source.Period != nil {
			period, err := agentDisplayText(*source.Period)
			if err != nil {
				return err
			}
			source.Period = &period
		}
		if !seen[source.ID] {
			out.Sources = append(out.Sources, source)
			seen[source.ID] = true
		}
		return nil
	}
	paragraphs := 0
	for _, item := range blocks {
		b := item.(map[string]any)
		typ := b["type"].(string)
		if typ == "paragraph" {
			paragraphs++
			if paragraphs > 4 {
				return nil, errAgentDraft
			}
			txt := b["text"].(string)
			if out.Kind == "refusal" && txt != agentRefusal {
				return nil, errAgentDraft
			}
			txt, sources, err := f.paragraph(txt)
			if err != nil {
				return nil, err
			}
			for _, source := range sources {
				if err := addSource(source); err != nil {
					return nil, err
				}
			}
			out.Blocks = append(out.Blocks, map[string]any{"type": "paragraph", "text": txt})
			continue
		}
		if out.Kind != "answer" {
			return nil, errAgentDraft
		}
		var ref agentReference
		var ok bool
		switch typ {
		case "stat":
			ref, ok = f.refs[b["factRef"].(string)]
		case "date_estimate":
			ref, ok = f.refs[b["estimateRef"].(string)]
		case "bulletin_cutoff":
			ref, ok = f.refs[b["cutoffRef"].(string)]
		case "table":
			rows := []map[string]any{}
			columns := []map[string]string{}
			keys := map[string]bool{}
			for _, key := range b["columns"].([]any) {
				k := key.(string)
				label, exists := agentColumnLabels[k]
				if !exists || keys[k] {
					return nil, errAgentDraft
				}
				keys[k] = true
				columns = append(columns, map[string]string{"key": k, "label": label})
			}
			group, source := "", ""
			for _, id := range b["rowRefs"].([]any) {
				ref, ok = f.refs[id.(string)]
				if !ok || ref.row == nil || (group != "" && (group != ref.group || source != ref.source.ID)) {
					return nil, errAgentDraft
				}
				group, source = ref.group, ref.source.ID
				if group == "community" && (!keys["sampleSize"] || !keys["completed"]) {
					return nil, errAgentDraft
				}
				row := map[string]any{}
				for k := range keys {
					x, exists := ref.row[k]
					if !exists {
						return nil, errAgentDraft
					}
					row[k] = x
				}
				rows = append(rows, row)
			}
			ref.block = map[string]any{"type": "table", "columns": columns, "rows": rows, "sourceId": ref.source.ID}
		}
		if !ok || ref.block == nil || ref.block["type"] != typ {
			return nil, errAgentDraft
		}
		// Round-trip to plain JSON so pointer-valued cells receive the same checks.
		data, err := json.Marshal(ref.block)
		if err != nil {
			return nil, err
		}
		var block map[string]any
		if err := json.Unmarshal(data, &block); err != nil {
			return nil, err
		}
		if err := normalizeAgentValue(block); err != nil {
			return nil, err
		}
		out.Blocks = append(out.Blocks, block)
		if err := addSource(ref.source); err != nil {
			return nil, err
		}
	}
	if out.Kind == "answer" && len(out.Sources) == 0 {
		return nil, errAgentDraft
	}
	return out, nil
}

var agentPlaceholder = regexp.MustCompile(`\{\{([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)?)\}\}`)
var agentToken = regexp.MustCompile(`[\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+)*(?:\([\p{L}\p{N}]+\))?`)

// Identifiers with numerals are allowed only when a delivered tool result contains
// the whole token. Standalone counts and dates still require placeholders.
func (f *agentFacts) remember(value any) {
	switch v := value.(type) {
	case string:
		if f.tokens == nil {
			f.tokens = map[string]bool{}
		}
		for _, token := range agentToken.FindAllString(v, -1) {
			f.tokens[token] = true
		}
	case *string:
		if v != nil {
			f.remember(*v)
		}
	case map[string]any:
		for _, child := range v {
			f.remember(child)
		}
	}
}

func (f *agentFacts) paragraph(text string) (string, []agentSource, error) {
	prose := agentPlaceholder.ReplaceAllString(text, "reference")
	if !agentCleanText(prose) || strings.ContainsAny(prose, "{}\r\n") {
		return "", nil, errAgentStyle
	}
	for _, token := range agentToken.FindAllString(prose, -1) {
		number, letter := false, false
		for _, r := range token {
			number = number || unicode.IsNumber(r)
			letter = letter || unicode.IsLetter(r)
		}
		if number && (!letter || !f.tokens[token]) {
			return "", nil, errAgentDraft
		}
	}
	sources := []agentSource{}
	var failure error
	resolved := agentPlaceholder.ReplaceAllStringFunc(text, func(placeholder string) string {
		id := strings.TrimSuffix(strings.TrimPrefix(placeholder, "{{"), "}}")
		parts := strings.SplitN(id, ".", 2)
		ref, ok := f.refs[parts[0]]
		if !ok {
			failure = errAgentDraft
			return ""
		}
		var value any
		unit := ""
		if len(parts) == 2 {
			if parts[1] == "sourceId" || parts[1] == "type" {
				failure = errAgentDraft
				return ""
			}
			values := ref.block
			if ref.row != nil {
				values = ref.row
			}
			value, ok = values[parts[1]]
			if !ok {
				failure = errAgentDraft
				return ""
			}
		} else if ref.block != nil {
			switch ref.block["type"] {
			case "stat":
				value = ref.block["value"]
				unit, _ = ref.block["unit"].(string)
			case "date_estimate":
				value = ref.block["estimatedDate"]
			case "bulletin_cutoff":
				value = ref.block["cutoff"]
				if ref.block["status"] != "date" {
					value = ref.block["status"]
				}
			default:
				failure = errAgentDraft
				return ""
			}
		} else {
			failure = errAgentDraft
			return ""
		}
		data, err := json.Marshal(value)
		if err != nil {
			failure = errAgentDraft
			return ""
		}
		formatted := string(data)
		if formatted == "null" {
			formatted = "not available"
			unit = ""
		} else if len(data) > 0 && data[0] == '"' {
			if json.Unmarshal(data, &formatted) != nil {
				failure = errAgentDraft
			}
		} else if len(data) == 0 || data[0] == '{' || data[0] == '[' {
			failure = errAgentDraft
		}
		if unit != "" {
			formatted += " " + unit
		}
		formatted, err = agentDisplayText(formatted)
		if err != nil {
			failure = err
			return ""
		}
		sources = append(sources, ref.source)
		return formatted
	})
	if failure != nil {
		return "", nil, failure
	}
	if utf8.RuneCountInString(resolved) > 400 || !agentCleanText(resolved) {
		return "", nil, errAgentStyle
	}
	return resolved, sources, nil
}

var agentIdentifier = regexp.MustCompile(`\b[0-9]+\([a-zA-Z0-9]+\)`)
var agentWords = regexp.MustCompile(`(?i)\b(additionally|crucial|delve|enduring|enhance|fostering|garner|interplay|intricate|landscape|pivotal|showcase|showcasing|tapestry|testament|underscore|vibrant|highlighting|ensuring|reflecting|substrate|wedge|vector|locus|vantage|nexus|primitive|harness|surface|bedrock|scaffolding|modality|paradigm|gold-plating|ratchet|evacuate|endgame|flywheel|utilize|leverage|facilitate|numerous)\b`)
var agentPhrases = []string{"experts believe", "industry reports suggest", "some critics argue", "serves as", "stands as", "boasts", "features", "not just", "i hope this helps", "let me know", "of course", "certainly", "found the smoking gun", "great question", "you're absolutely right", "in order to", "due to the fact that", "it is important to note that", "could potentially", "possibly be argued", "the future looks bright", "north star", "in the event that"}
var agentLink = regexp.MustCompile(`(?i)([a-z][a-z0-9+.-]*://|www\.|mailto:|[\p{L}\p{N}-]+\.[a-z]{2,}(?:\b|/))`)
var agentEmphasis = regexp.MustCompile(`(^|\s)_[^_]+_($|\s|[.,!?])`)

func agentCleanText(s string) bool {
	if strings.TrimSpace(s) != s || agentWords.MatchString(s) || agentLink.MatchString(s) || agentEmphasis.MatchString(s) {
		return false
	}
	for _, p := range []string{"—", "–", "--", "―", "‒", "−", " - ", "“", "”", "‘", "’", "*", "__", "#", "`", "[", "]", "@", "→", "←", "↑", "↓", "⇒", "<-", "->"} {
		if strings.Contains(s, p) {
			return false
		}
	}
	for _, line := range strings.Split(s, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "- ") || strings.HasPrefix(strings.TrimSpace(line), "> ") {
			return false
		}
	}
	if strings.ContainsAny(agentIdentifier.ReplaceAllString(s, ""), "()") {
		return false
	}
	for _, r := range s {
		if unicode.Is(unicode.So, r) || r == '\u200d' || r == '\ufe0f' || (r >= 0x2190 && r <= 0x21ff) {
			return false
		}
	}
	lower := strings.ToLower(s)
	for _, p := range agentPhrases {
		if strings.Contains(lower, p) {
			return false
		}
	}
	return true
}

var agentPunctuationSpace = regexp.MustCompile(`\s+([,.;:!?])`)
var agentRepeatedComma = regexp.MustCompile(`,\s*,`)

func agentLabel(s string) string {
	s = strings.NewReplacer("Fiancé(e)", "Fiancé or fiancée", "fiancé(e)", "fiancé or fiancée", "widow(er)", "widow or widower", " - ", ", ", "--", ", ", "“", `"`, "”", `"`, "‘", "'", "’", "'").Replace(s)
	s = strings.Map(func(r rune) rune {
		if r == '—' || r == '–' || r == '―' || r == '‒' || r == '−' {
			return '\x01'
		}
		return r
	}, s)
	s = strings.ReplaceAll(s, "\x01", ", ")
	for _, arrow := range []string{"->", "<-"} {
		s = strings.ReplaceAll(s, arrow, " to ")
	}
	var expanded strings.Builder
	for _, r := range s {
		if (r >= 0x2190 && r <= 0x21ff) || (r >= 0x27f0 && r <= 0x27ff) {
			expanded.WriteString(" to ")
		} else {
			expanded.WriteRune(r)
		}
	}
	s = expanded.String()
	ids := []string{}
	s = agentIdentifier.ReplaceAllStringFunc(s, func(id string) string { ids = append(ids, id); return fmt.Sprintf("\x00%d\x00", len(ids)-1) })
	s = strings.NewReplacer("(", " ", ")", " ").Replace(s)
	for i, id := range ids {
		s = strings.ReplaceAll(s, fmt.Sprintf("\x00%d\x00", i), id)
	}
	s = strings.Join(strings.Fields(s), " ")
	s = agentPunctuationSpace.ReplaceAllString(s, "$1")
	return agentRepeatedComma.ReplaceAllString(s, ",")
}

func agentDisplayText(s string) (string, error) {
	s = agentLabel(s)
	if !agentCleanText(s) {
		return "", errAgentStyle
	}
	return s, nil
}

// Applies to every displayed JSON string, including labels, cells and periods.
// Source URLs are not prose and are constructed separately by the server.
func normalizeAgentValue(value any) error {
	switch v := value.(type) {
	case map[string]any:
		for key, child := range v {
			if text, ok := child.(string); ok {
				normalized, err := agentDisplayText(text)
				if err != nil {
					return err
				}
				v[key] = normalized
			} else if err := normalizeAgentValue(child); err != nil {
				return err
			}
		}
	case []any:
		for _, child := range v {
			if err := normalizeAgentValue(child); err != nil {
				return err
			}
		}
	}
	return nil
}
