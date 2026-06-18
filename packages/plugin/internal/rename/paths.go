package rename

import (
	"os"
	"path/filepath"
	"strings"
)

func codexHome() string {
	if value := os.Getenv("CODEX_HOME"); value != "" {
		return value
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ".codex"
	}
	return filepath.Join(home, ".codex")
}

func packageHome() string {
	if value := os.Getenv("PLUGIN_DATA"); value != "" {
		return value
	}
	return filepath.Join(codexHome(), "codex-session-auto-rename")
}

func configPath() string {
	return filepath.Join(packageHome(), "config.json")
}

func resolveHomePath(path string) string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		home = "."
	}
	if path == "~" {
		return home
	}
	if strings.HasPrefix(path, "~/") {
		return filepath.Join(home, path[2:])
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return absolute
}
