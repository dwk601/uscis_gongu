package uscis

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
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
	refs  map[string]agentReference
	next  int
	bytes int
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
	for _, item := range blocks {
		b := item.(map[string]any)
		typ := b["type"].(string)
		if typ == "paragraph" {
			txt := b["text"].(string)
			if !agentCleanText(txt) {
				return nil, errAgentStyle
			}
			if out.Kind == "refusal" {
				txt = agentRefusal
			} else if !agentParagraphs[txt] {
				return nil, errAgentDraft
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
		out.Blocks = append(out.Blocks, ref.block)
		if !seen[ref.source.ID] {
			out.Sources = append(out.Sources, ref.source)
			seen[ref.source.ID] = true
		}
	}
	if out.Kind == "answer" && len(out.Sources) == 0 {
		return nil, errAgentDraft
	}
	return out, nil
}

// A small connective vocabulary prevents paragraphs from becoming a second,
// ungrounded channel for facts. All substantive content uses references.
var agentParagraphs = map[string]bool{
	"Here is the reported data.":                           true,
	"These are estimates, not USCIS commitments.":          true,
	"Which form and series do you mean?":                   true,
	"Which form, visa type and filing cohort do you mean?": true,
	"Which category, country and chart do you mean?":       true,
	"Which fiscal period do you mean?":                     true,
	"No matching data is available.":                       true,
	"Percentiles describe completed reports only.":         true,
}

var agentAside = regexp.MustCompile(`\([^)]*\)`)
var agentIdentifier = regexp.MustCompile(`\b[0-9]+\([a-zA-Z0-9]+\)`)
var agentWords = regexp.MustCompile(`(?i)\b(additionally|crucial|delve|enduring|enhance|fostering|garner|interplay|intricate|landscape|pivotal|showcase|showcasing|tapestry|testament|underscore|vibrant|highlighting|ensuring|reflecting|substrate|wedge|vector|locus|vantage|nexus|primitive|harness|surface|bedrock|scaffolding|modality|paradigm|gold-plating|ratchet|evacuate|endgame|flywheel|utilize|leverage|facilitate|numerous)\b`)
var agentPhrases = []string{"experts believe", "industry reports suggest", "some critics argue", "serves as", "stands as", "boasts", "features", "not just", "i hope this helps", "let me know", "of course", "certainly", "found the smoking gun", "great question", "you're absolutely right", "in order to", "due to the fact that", "it is important to note that", "could potentially", "possibly be argued", "the future looks bright", "north star", "in the event that"}

func agentCleanText(s string) bool {
	if strings.TrimSpace(s) != s || agentWords.MatchString(s) {
		return false
	}
	for _, p := range []string{"—", "–", " - ", "“", "”", "‘", "’", "**", "#", "`", "→", "←", "↑", "↓", "⇒", "<-", "->"} {
		if strings.Contains(s, p) {
			return false
		}
	}
	for _, line := range strings.Split(s, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "- ") || strings.HasPrefix(strings.TrimSpace(line), "* ") || strings.HasPrefix(strings.TrimSpace(line), "> ") {
			return false
		}
	}
	if strings.ContainsAny(agentIdentifier.ReplaceAllString(s, ""), "()") {
		return false
	}
	for _, r := range s {
		if unicode.Is(unicode.So, r) || r == '\u200d' || r == '\ufe0f' {
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

func agentLabel(s string) string {
	s = strings.NewReplacer("Fiancé(e)", "Fiance", "fiancé(e)", "fiance", "widow(er)", "widow or widower", "→", "to", "←", "from", "⇒", "to", "–", " to ", "—", ",", " - ", ", ", "“", `"`, "”", `"`, "‘", "'", "’", "'").Replace(s)
	// Preserve legal identifiers, but remove parenthetical prose from labels.
	ids := []string{}
	s = agentIdentifier.ReplaceAllStringFunc(s, func(id string) string { ids = append(ids, id); return fmt.Sprintf("\x00%d\x00", len(ids)-1) })
	s = agentAside.ReplaceAllStringFunc(s, func(v string) string { return " " + strings.Trim(v, "()") })
	for i, id := range ids {
		s = strings.ReplaceAll(s, fmt.Sprintf("\x00%d\x00", i), id)
	}
	return strings.Join(strings.Fields(s), " ")
}
