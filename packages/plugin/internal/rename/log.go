package rename

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type LogEntry struct {
	At         string   `json:"at"`
	Level      string   `json:"level"`
	Event      string   `json:"event"`
	ThreadID   string   `json:"threadId,omitempty"`
	Decision   string   `json:"decision,omitempty"`
	Reason     string   `json:"reason,omitempty"`
	Signals    []string `json:"signals,omitempty"`
	OldTitle   *string  `json:"oldTitle,omitempty"`
	NewTitle   *string  `json:"newTitle,omitempty"`
	Confidence *float64 `json:"confidence,omitempty"`
	SourceHash string   `json:"sourceHash,omitempty"`
	Error      string   `json:"error,omitempty"`
	DurationMs int64    `json:"durationMs,omitempty"`
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
	defer file.Close()
	_, _ = file.Write(raw)
}
