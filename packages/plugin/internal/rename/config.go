package rename

import (
	"encoding/json"
	"os"
	"path/filepath"
)

func DefaultRuntimeConfig() Config {
	config := DefaultConfig()
	config.StateDir = filepath.Join(packageHome(), "state")
	config.LogPath = filepath.Join(packageHome(), "logs.jsonl")
	return config
}

func ReadConfig() Config {
	config := DefaultRuntimeConfig()
	raw, err := os.ReadFile(configPath())
	if err != nil {
		return config
	}
	if err := json.Unmarshal(raw, &config); err != nil {
		return DefaultRuntimeConfig()
	}
	if config.StateDir == "" {
		config.StateDir = filepath.Join(packageHome(), "state")
	} else {
		config.StateDir = resolveHomePath(config.StateDir)
	}
	if config.LogPath == "" {
		config.LogPath = filepath.Join(packageHome(), "logs.jsonl")
	} else {
		config.LogPath = resolveHomePath(config.LogPath)
	}
	if config.CodexPath == "" {
		config.CodexPath = "codex"
	}
	if config.AppServerTimeoutMs <= 0 {
		config.AppServerTimeoutMs = 1500
	}
	if config.MaxTitleLength <= 0 {
		config.MaxTitleLength = 64
	}
	if config.LLM.Model == "" {
		config.LLM.Model = "gpt-5.4-mini"
	}
	if config.LLM.TimeoutMs <= 0 {
		config.LLM.TimeoutMs = 2000
	}
	return config
}

func EnsureConfig() (Config, error) {
	if err := os.MkdirAll(packageHome(), 0o700); err != nil {
		return Config{}, err
	}
	path := configPath()
	if _, err := os.Stat(path); err == nil {
		return ReadConfig(), nil
	} else if !os.IsNotExist(err) {
		return Config{}, err
	}
	config := DefaultRuntimeConfig()
	raw, err := json.MarshalIndent(config, "", "\t")
	if err != nil {
		return Config{}, err
	}
	raw = append(raw, '\n')
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return Config{}, err
	}
	return config, nil
}
