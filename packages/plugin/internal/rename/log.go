package rename

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type LogEntry struct {
	At               string   `json:"at"`
	Level            string   `json:"level"`
	Event            string   `json:"event"`
	Mode             Mode     `json:"mode,omitempty"`
	HookEvent        string   `json:"hookEvent,omitempty"`
	ThreadID         string   `json:"threadId,omitempty"`
	TurnID           string   `json:"turnId,omitempty"`
	Decision         string   `json:"decision,omitempty"`
	Reason           string   `json:"reason,omitempty"`
	Signals          []string `json:"signals,omitempty"`
	OldTitle         *string  `json:"oldTitle,omitempty"`
	NewTitle         *string  `json:"newTitle,omitempty"`
	VerifiedTitle    *string  `json:"verifiedTitle,omitempty"`
	Confidence       *float64 `json:"confidence,omitempty"`
	PromptHash       string   `json:"promptHash,omitempty"`
	SourceHash       string   `json:"sourceHash,omitempty"`
	StateTurnOrdinal int      `json:"stateTurnOrdinal,omitempty"`
	ThreadRead       bool     `json:"threadRead,omitempty"`
	ThreadReadMode   string   `json:"threadReadMode,omitempty"`
	AppServerSet     bool     `json:"appServerSet,omitempty"`
	AppServerSetMode string   `json:"appServerSetMode,omitempty"`
	Error            string   `json:"error,omitempty"`
	VerifyError      string   `json:"verifyError,omitempty"`
	DurationMs       int64    `json:"durationMs,omitempty"`
}

func LogDecision(config Config, entry LogEntry) {
	if err := os.MkdirAll(filepath.Dir(config.LogPath), 0o700); err != nil {
		return
	}
	raw, err := json.Marshal(entry)
	if err != nil {
		return
	}
	raw = append(raw, '\n')
	file, err := os.OpenFile(config.LogPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	if _, err := file.Write(raw); err != nil {
		if closeErr := file.Close(); closeErr != nil {
			return
		}
		return
	}
	if err := file.Close(); err != nil {
		return
	}
}
