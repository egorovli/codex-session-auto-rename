package rename

import (
	"encoding/json"
	"io"
	"regexp"
	"strings"
)

type HookInput map[string]any

func ReadHookInput(reader io.Reader) (HookInput, error) {
	raw, err := io.ReadAll(reader)
	if err != nil {
		return HookInput{}, err
	}
	text := strings.TrimSpace(string(raw))
	if text == "" {
		return HookInput{}, nil
	}
	var input HookInput
	if err := json.Unmarshal([]byte(text), &input); err != nil {
		return HookInput{}, err
	}
	return input, nil
}

func (input HookInput) StringField(name string) string {
	if value, ok := input[name].(string); ok {
		return value
	}
	return ""
}

func ExtractPrompt(input HookInput) string {
	for _, key := range []string{"prompt", "user_prompt", "message"} {
		if value := strings.TrimSpace(input.StringField(key)); value != "" {
			return value
		}
	}
	promptLike := regexp.MustCompile(`(?i)prompt|message|input`)
	for key, value := range input {
		text, ok := value.(string)
		if !ok || !promptLike.MatchString(key) {
			continue
		}
		if strings.TrimSpace(text) != "" {
			return text
		}
	}
	return ""
}

func ExtractAssistantMessage(input HookInput) string {
	return input.StringField("last_assistant_message")
}
