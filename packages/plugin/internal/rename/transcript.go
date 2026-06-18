package rename

import (
	"bufio"
	"encoding/json"
	"os"
	"strings"
)

var secretPatterns = []*regexpWrapper{
	mustRegexp(`(?i)(api[_-]?key|access[_-]?token|secret|password|passwd|authorization)\s*[:=]\s*["']?[^"'\s]+`),
	mustRegexp(`sk-[A-Za-z0-9_-]{20,}`),
	mustRegexp(`ghp_[A-Za-z0-9_]{20,}`),
}

func ReadTranscriptTail(path string, maxBytes int64) TranscriptTail {
	if path == "" {
		return TranscriptTail{}
	}
	if maxBytes <= 0 {
		maxBytes = 384 * 1024
	}
	file, err := os.Open(path)
	if err != nil {
		return TranscriptTail{}
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return TranscriptTail{}
	}
	start := stat.Size() - maxBytes
	if start < 0 {
		start = 0
	}
	if _, err := file.Seek(start, 0); err != nil {
		return TranscriptTail{}
	}

	userMessages := []string{}
	assistantMessages := []string{}
	toolSignals := []string{}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var parsed map[string]any
		if err := json.Unmarshal(line, &parsed); err != nil {
			continue
		}
		payload, ok := parsed["payload"].(map[string]any)
		if !ok {
			continue
		}
		collectFromPayload(payload, &userMessages, &assistantMessages, &toolSignals)
	}
	return TranscriptTail{
		UserMessages:      tail(userMessages, 3),
		AssistantMessages: tail(assistantMessages, 2),
		ToolSignals:       tail(toolSignals, 12),
	}
}

func collectFromPayload(payload map[string]any, userMessages, assistantMessages, toolSignals *[]string) {
	switch payload["type"] {
	case "message":
		text := extractTextContent(payload["content"])
		if text == "" {
			return
		}
		switch payload["role"] {
		case "user":
			*userMessages = append(*userMessages, text)
		case "assistant":
			*assistantMessages = append(*assistantMessages, text)
		}
	case "response_item":
		if nested, ok := payload["payload"].(map[string]any); ok {
			collectFromPayload(nested, userMessages, assistantMessages, toolSignals)
		}
	case "event_msg":
		if nested, ok := payload["payload"].(map[string]any); ok && nested["type"] == "task_complete" {
			*toolSignals = append(*toolSignals, "task completed")
		}
	case "function_call", "tool_call":
		name, ok := payload["name"].(string)
		if !ok || name == "" {
			name = "tool"
		}
		*toolSignals = append(*toolSignals, name)
	}
}

func extractTextContent(content any) string {
	switch value := content.(type) {
	case string:
		return normalizeTranscriptText(value)
	case []any:
		parts := []string{}
		for _, item := range value {
			record, ok := item.(map[string]any)
			if !ok {
				continue
			}
			for _, key := range []string{"text", "input_text", "output_text"} {
				if text, ok := record[key].(string); ok {
					parts = append(parts, text)
					break
				}
			}
		}
		return normalizeTranscriptText(strings.Join(parts, " "))
	default:
		return ""
	}
}

func normalizeTranscriptText(input string) string {
	return clip(normalizeWhitespace(redactSecrets(input)), 2500)
}

func redactSecrets(input string) string {
	output := input
	for _, pattern := range secretPatterns {
		output = pattern.ReplaceAllString(output, "[REDACTED]")
	}
	return output
}

func tail(values []string, count int) []string {
	if len(values) <= count {
		return values
	}
	return values[len(values)-count:]
}
