package uscis

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/shared"
)

const agentUnavailable = "Ask gongu is unavailable. Please try again later."

var agentSlots = make(chan struct{}, 4)

type agentConfig struct {
	base, key, model, effort         string
	perCall, output, question, daily int64
}

func loadAgentConfig() (agentConfig, error) {
	c := agentConfig{base: os.Getenv("AGENT_BASE_URL"), key: os.Getenv("AGENT_API_KEY"), model: os.Getenv("AGENT_MODEL"), effort: "low"}
	if c.base == "" || c.key == "" || c.model == "" {
		return c, errors.New("agent not configured")
	}
	if s, ok := os.LookupEnv("AGENT_REASONING_EFFORT"); ok {
		c.effort = s
	}
	for _, v := range []struct {
		name     string
		dst      *int64
		fallback int64
	}{
		{"AGENT_MAX_OUTPUT_TOKENS", &c.perCall, 1024}, {"AGENT_MAX_QUESTION_OUTPUT_TOKENS", &c.output, 2048}, {"AGENT_MAX_QUESTION_TOKENS", &c.question, 16000}, {"AGENT_DAILY_TOKENS", &c.daily, 100000},
	} {
		*v.dst = v.fallback
		if s := os.Getenv(v.name); s != "" {
			n, err := strconv.ParseInt(s, 10, 64)
			if err != nil || n < 1 || n > 1000000000 {
				return c, errors.New("invalid agent limit")
			}
			*v.dst = n
		}
	}
	return c, nil
}

var errAgentQuestion = errors.New("question exceeds token allocation")

func agentError(e *core.RequestEvent, ctx context.Context, cause error) error {
	if errors.Is(cause, errAgentQuestion) {
		return e.Error(400, "Invalid question.", nil)
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(cause, context.DeadlineExceeded) {
		return e.Error(504, "The answer took too long. Please try again.", nil)
	}
	return e.Error(503, agentUnavailable, nil)
}
func agentQuotaError(e *core.RequestEvent, b agentBudget) error {
	return e.JSON(429, map[string]any{"status": 429, "message": "You have used today's Ask gongu budget.", "data": map[string]any{"reason": map[string]string{"code": "daily_budget_exhausted", "message": "Your daily token budget cannot cover another question."}, "remaining": b.Remaining, "resetsAt": b.ResetsAt}})
}

func (a *api) agentAsk(e *core.RequestEvent) error {
	ctx, cancel := context.WithTimeout(e.Request.Context(), 30*time.Second)
	defer cancel()
	raw, err := io.ReadAll(io.LimitReader(e.Request.Body, 8193))
	value, decodeErr := decodeAgentJSON(raw)
	body, ok := value.(map[string]any)
	if err != nil || len(raw) > 8192 || !utf8.Valid(raw) || decodeErr != nil || !ok || len(body) != 1 {
		return e.Error(400, "Invalid question.", nil)
	}
	question, ok := body["question"].(string)
	if !ok {
		return e.Error(400, "Invalid question.", nil)
	}
	question = strings.TrimSpace(question)
	if n := utf8.RuneCountInString(question); n < 1 || n > 2000 {
		return e.Error(400, "Invalid question.", nil)
	}
	c, err := loadAgentConfig()
	if err != nil {
		return agentError(e, ctx, err)
	}
	select {
	case agentSlots <- struct{}{}:
		defer func() { <-agentSlots }()
	default:
		const message = "Ask gongu is busy. Please try again in a moment."
		return e.JSON(429, map[string]any{"status": 429, "message": message, "data": map[string]any{"reason": map[string]string{"code": "busy", "message": message}}})
	}
	meter, err := reserveAgent(ctx, e.App, e.Auth.Id, c)
	if errors.Is(err, errAgentBudget) {
		return agentQuotaError(e, meter.budget)
	}
	if err != nil {
		return agentError(e, ctx, err)
	}
	start := time.Now()
	status := 503
	defer func() {
		e.App.Logger().Info("agent question", "status", status, "duration", time.Since(start), "input_tokens", meter.input, "output_tokens", meter.output, "estimated_tokens", meter.estimated)
	}()
	response, err := a.runAgent(ctx, e.App, c, meter, question)
	settled := meter.settle()
	if err != nil || settled != nil || ctx.Err() != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
			status = 504
		}
		if errors.Is(err, errAgentQuestion) {
			status = 400
		}
		return agentError(e, ctx, errors.Join(err, settled))
	}
	response.Budget = meter.budget
	status = 200
	return e.JSON(200, response)
}

func (a *api) runAgent(ctx context.Context, app core.App, c agentConfig, m *agentMeter, question string) (*agentResponse, error) {
	client := openai.NewClient(option.WithBaseURL(c.base), option.WithAPIKey(c.key), option.WithMaxRetries(0))
	messages := []openai.ChatCompletionMessageParamUnion{openai.SystemMessage(agentRole + agentStyle), openai.UserMessage(question)}
	facts := &agentFacts{refs: map[string]agentReference{}}
	dataCalls, rounds := 0, 0
	repair, clarify := false, false
	tools := a.agentTools()
	terminalTools := tools[len(tools)-1:]
	var outputSpent, previousPrompt, previousVariableBytes, previousFixed int64
	for calls := 0; calls < 4; calls++ {
		terminal := repair || rounds == 2 || dataCalls == 3
		cap := min(c.perCall, c.output-outputSpent)
		callTools := tools
		if terminal {
			callTools = terminalTools
		}
		params := openai.ChatCompletionNewParams{Model: c.model, Messages: messages, Tools: callTools, ToolChoice: openai.ChatCompletionToolChoiceOptionUnionParam{OfAuto: openai.String("auto")}, MaxCompletionTokens: openai.Int(cap), ReasoningEffort: shared.ReasoningEffort(c.effort)}
		encodedTools, err := json.Marshal(callTools)
		if err != nil {
			return nil, err
		}
		fixed := agentFixedTokens([]byte(agentRole+agentStyle)) + agentFixedTokens(encodedTools) + 128
		variableBytes := int64(len(question))
		for _, message := range messages[2:] {
			encoded, err := json.Marshal(message)
			if err != nil {
				return nil, err
			}
			variableBytes += int64(len(encoded))
		}
		// Missing usage charges all variable bytes, never a prose ratio. Once
		// usage is reported, preflight from that prompt and only appended bytes.
		fallbackInput := fixed + variableBytes
		inputEstimate := fallbackInput
		if calls > 0 {
			inputEstimate = previousPrompt + variableBytes - previousVariableBytes + max(0, fixed-previousFixed)
		}
		if cap < 1 || m.input+m.output+m.estimated+inputEstimate+cap > c.question {
			if calls == 0 && fixed+cap <= c.question {
				return nil, errAgentQuestion
			}
			return nil, errAgentDraft
		}
		callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		var raw []byte
		completion, callErr := client.Chat.Completions.New(callCtx, params, option.WithMiddleware(func(req *http.Request, next option.MiddlewareNext) (*http.Response, error) {
			res, err := next(req)
			if err != nil {
				return res, err
			}
			data, readErr := io.ReadAll(io.LimitReader(res.Body, 65537))
			res.Body.Close()
			raw = data
			if readErr != nil {
				return nil, readErr
			}
			if len(data) > 65536 {
				return nil, errors.New("provider response too large")
			}
			res.Body = io.NopCloser(bytes.NewReader(data))
			return res, nil
		}))
		deadlineErr := callCtx.Err()
		cancel()
		in, out, estimated, chargedOutput := agentUsage(raw, fallbackInput, cap)
		outputSpent += chargedOutput
		previousPrompt = in
		if estimated > 0 {
			previousPrompt = fallbackInput
		}
		previousVariableBytes, previousFixed = variableBytes, fixed
		chargeErr := m.charge(in, out, estimated)
		if errors.Is(deadlineErr, context.DeadlineExceeded) {
			return nil, errors.Join(context.DeadlineExceeded, chargeErr)
		}
		if chargeErr != nil {
			return nil, chargeErr
		}
		if callErr != nil {
			return nil, callErr
		}
		if m.input+m.output+m.estimated > c.question || outputSpent > c.output {
			return nil, errAgentDraft
		}
		if completion == nil || len(completion.Choices) != 1 {
			return nil, errAgentDraft
		}
		msg := completion.Choices[0].Message
		tools := msg.ToolCalls
		if len(tools) == 0 {
			return nil, errAgentDraft
		}
		if len(tools) == 1 && tools[0].Type == "function" && tools[0].Function.Name == "answer" {
			response, err := facts.resolve(tools[0].Function.Arguments)
			if (errors.Is(err, errAgentStyle) || errors.Is(err, errAgentDraft)) && !repair && calls < 3 {
				repair = true
				messages = append(messages, msg.ToParam(), openai.ToolMessage("The draft failed style or reference validation. Call answer again with short plain paragraphs and valid result references. Use placeholders for values. Do not call data tools.", tools[0].ID))
				continue
			}
			if err != nil {
				return nil, err
			}
			if clarify && response.Kind != "clarification" {
				return nil, errAgentDraft
			}
			return response, nil
		}
		if terminal || len(tools) > 3-dataCalls {
			return nil, errAgentDraft
		}
		// Validate the entire round before dispatching any reader.
		args := make([]map[string]any, len(tools))
		ids := map[string]bool{}
		for i, tool := range tools {
			if tool.Type != "function" || tool.ID == "" || ids[tool.ID] {
				return nil, errAgentDraft
			}
			ids[tool.ID] = true
			args[i], err = validateAgentArgs(tool.Function.Name, tool.Function.Arguments)
			if err != nil {
				return nil, err
			}
		}
		messages = append(messages, msg.ToParam())
		rounds++
		for i, tool := range tools {
			dataCalls++
			app.Logger().Info("agent tool", "tool", tool.Function.Name)
			result, err := a.agentRead(ctx, facts, tool.Function.Name, args[i])
			if errors.Is(err, errAgentAmbiguous) {
				clarify = true
				result = `{"clarificationRequired":true}`
			} else if err != nil {
				return nil, err
			}
			messages = append(messages, openai.ToolMessage(result, tool.ID))
		}
	}
	return nil, errAgentDraft
}

// The fixed English prompt uses roughly four ASCII characters per token.
// Count its non-ASCII bytes conservatively. Variable messages never use this ratio.
func agentFixedTokens(content []byte) int64 {
	var ascii, nonASCII int64
	for _, b := range content {
		if b < utf8.RuneSelf {
			ascii++
		} else {
			nonASCII++
		}
	}
	return (ascii+3)/4 + nonASCII
}

func agentUsage(raw []byte, inputEstimate, cap int64) (input, output, estimated, chargedOutput int64) {
	var v struct {
		Usage *struct {
			Input  *int64 `json:"prompt_tokens"`
			Output *int64 `json:"completion_tokens"`
		} `json:"usage"`
	}
	if json.Unmarshal(raw, &v) == nil && v.Usage != nil && v.Usage.Input != nil && v.Usage.Output != nil && *v.Usage.Input >= 0 && *v.Usage.Output >= 0 && *v.Usage.Input <= 1000000000 && *v.Usage.Output <= 1000000000 {
		return *v.Usage.Input, *v.Usage.Output, 0, *v.Usage.Output
	}
	return 0, 0, inputEstimate + cap, cap
}
