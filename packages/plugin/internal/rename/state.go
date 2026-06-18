package rename

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

var unsafeStateNameRe = regexp.MustCompile(`[^a-zA-Z0-9_.-]`)

func ReadThreadState(config Config, threadID string) ThreadState {
	path := statePath(config, threadID)
	state := InitialThreadState(threadID)
	// #nosec G304 -- statePath constrains thread state reads to the configured local state directory.
	raw, err := os.ReadFile(path)
	if err != nil {
		return state
	}
	if err := json.Unmarshal(raw, &state); err != nil {
		return InitialThreadState(threadID)
	}
	state.ThreadID = threadID
	if state.RecentTitles == nil {
		state.RecentTitles = []string{}
	}
	if state.LastProcessedTurnIDs == nil {
		state.LastProcessedTurnIDs = []string{}
	}
	return state
}

func WriteThreadState(config Config, state ThreadState) error {
	if err := os.MkdirAll(config.StateDir, 0o700); err != nil {
		return err
	}
	path := statePath(config, state.ThreadID)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	state.UpdatedAt = time.Now().UTC()
	raw, err := json.MarshalIndent(state, "", "\t")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	tempPath := path + "." + intString(os.Getpid()) + ".tmp"
	if err := os.WriteFile(tempPath, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tempPath, path)
}

func WithThreadLock(config Config, threadID string, fn func() error) error {
	if err := os.MkdirAll(config.StateDir, 0o700); err != nil {
		return err
	}
	lockDir := filepath.Join(config.StateDir, safeName(threadID)+".lock")
	if err := os.Mkdir(lockDir, 0o700); err != nil {
		switch {
		case errors.Is(err, os.ErrExist) && clearStaleLock(lockDir):
			if retryErr := os.Mkdir(lockDir, 0o700); retryErr != nil {
				return retryErr
			}
		case errors.Is(err, os.ErrExist):
			return errors.New("thread lock busy for " + threadID)
		default:
			return err
		}
	}
	defer func() {
		if err := os.RemoveAll(lockDir); err != nil {
			return
		}
	}()

	ownerPath := filepath.Join(lockDir, "owner")
	if err := os.WriteFile(ownerPath, []byte(intString(os.Getpid())+"\n"), 0o600); err != nil {
		return err
	}
	return fn()
}

func statePath(config Config, threadID string) string {
	return filepath.Join(config.StateDir, safeName(threadID)+".json")
}

func safeName(threadID string) string {
	return unsafeStateNameRe.ReplaceAllString(filepath.Base(threadID), "_")
}

func clearStaleLock(lockDir string) bool {
	stat, err := os.Stat(lockDir)
	if err != nil {
		return false
	}
	if time.Since(stat.ModTime()) < time.Minute {
		return false
	}
	return os.RemoveAll(lockDir) == nil
}
