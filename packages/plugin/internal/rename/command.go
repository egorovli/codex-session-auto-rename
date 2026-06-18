package rename

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"time"
)

func Run(args []string, stdin io.Reader, stdout io.Writer) error {
	startedAt := time.Now()
	command := "decide"
	if len(args) > 0 && args[0] != "" {
		command = args[0]
	}
	if command == "version" {
		_, err := io.WriteString(stdout, "codex-session-auto-rename dev\n")
		return err
	}

	config := ReadConfig()
	if os.Getenv("CODEX_AUTO_RENAME_DISABLED") == "1" || !config.Enabled {
		LogDecision(config, LogEntry{
			At:       nowString(),
			Level:    "info",
			Event:    command,
			Decision: "disabled",
			Reason:   "disabled by config or environment",
		})
		return nil
	}
	if os.Getenv("CODEX_AUTO_RENAME_HOOK") == "1" {
		return nil
	}

	input, err := ReadHookInput(stdin)
	if err != nil {
		LogDecision(config, LogEntry{
			At:       nowString(),
			Level:    "error",
			Event:    command,
			Decision: "failed",
			Reason:   "invalid hook input",
			Error:    err.Error(),
		})
		return err
	}
	threadID := input.StringField("session_id")
	if threadID == "" {
		LogDecision(config, LogEntry{
			At:       nowString(),
			Level:    "warn",
			Event:    command,
			Decision: "skipped",
			Reason:   "missing session_id",
		})
		return nil
	}

	switch command {
	case "capture":
		return runCapture(config, threadID, input, time.Since(startedAt))
	case "decide":
		return runDecide(config, threadID, input, false, stdout, startedAt)
	case "suggest":
		return runDecide(config, threadID, input, true, stdout, startedAt)
	default:
		return errors.New("unknown command: " + command)
	}
}

func runCapture(config Config, threadID string, input HookInput, duration time.Duration) error {
	prompt := ExtractPrompt(input)
	turnID := input.StringField("turn_id")
	promptHash := ""
	stateTurnOrdinal := 0
	err := WithThreadLock(config, threadID, func() error {
		state := ReadThreadState(config, threadID)
		stateTurnOrdinal = state.TurnOrdinal
		if prompt != "" {
			if turnID == "" {
				turnID = sha256Hex(prompt)
			}
			cwd := optionalString(input.StringField("cwd"))
			pending := CreatePendingPrompt(turnID, prompt, cwd)
			state.PendingPrompt = &pending
			promptHash = pending.PromptHash
			return WriteThreadState(config, state)
		}
		return nil
	})
	if err != nil {
		return err
	}
	sourceHash := ""
	if prompt != "" {
		sourceHash = sha256Hex(prompt)
	}
	reason := "prompt captured"
	if prompt == "" {
		reason = "no prompt field found"
	}
	LogDecision(config, LogEntry{
		At:               nowString(),
		Level:            "info",
		Event:            "capture",
		Mode:             config.Mode,
		HookEvent:        input.StringField("hook_event_name"),
		ThreadID:         threadID,
		TurnID:           turnID,
		Decision:         "captured",
		Reason:           reason,
		PromptHash:       promptHash,
		SourceHash:       sourceHash,
		StateTurnOrdinal: stateTurnOrdinal,
		DurationMs:       duration.Milliseconds(),
	})
	return nil
}

func runDecide(config Config, threadID string, input HookInput, suggestOnly bool, stdout io.Writer, startedAt time.Time) error {
	eventName := "decide"
	if suggestOnly {
		eventName = "suggest"
	}
	var decision RenameDecision
	state := ReadThreadState(config, threadID)
	err := WithThreadLock(config, threadID, func() error {
		state = ReadThreadState(config, threadID)
		return nil
	})
	if err != nil {
		return err
	}

	thread, threadReadMode, threadErr := ReadThreadWithMode(config, threadID)
	threadRead := thread != nil
	currentTitle := oldTitle(thread)
	prompt := state.PendingPrompt
	if prompt == nil {
		promptText := ExtractPrompt(input)
		if promptText != "" {
			turnID := input.StringField("turn_id")
			if turnID == "" {
				turnID = sha256Hex(promptText)
			}
			cwd := optionalString(input.StringField("cwd"))
			pending := CreatePendingPrompt(turnID, promptText, cwd)
			prompt = &pending
		}
	}
	transcript := ReadTranscriptTail(input.StringField("transcript_path"), 384*1024)
	assistantMessage := ExtractAssistantMessage(input)
	sourceHash := computeSourceHash(threadID, input.StringField("turn_id"), prompt, assistantMessage, transcript)

	if thread == nil && !suggestOnly && config.Mode == ModeApply {
		errorText := ""
		if threadErr != nil {
			errorText = threadErr.Error()
		}
		LogDecision(config, LogEntry{
			At:               nowString(),
			Level:            "warn",
			Event:            "decide",
			Mode:             config.Mode,
			HookEvent:        input.StringField("hook_event_name"),
			ThreadID:         threadID,
			TurnID:           input.StringField("turn_id"),
			Decision:         "skipped",
			Reason:           "app-server thread/read unavailable",
			SourceHash:       sourceHash,
			StateTurnOrdinal: state.TurnOrdinal,
			Error:            errorText,
			DurationMs:       time.Since(startedAt).Milliseconds(),
		})
		return nil
	}

	configForDecision := config
	if suggestOnly {
		configForDecision.Mode = ModeDryRun
	}
	decision = DecideRename(DecideInput{
		Config:           configForDecision,
		State:            &state,
		Thread:           thread,
		Prompt:           prompt,
		AssistantMessage: assistantMessage,
		Transcript:       transcript,
		SourceHash:       sourceHash,
	})
	appServerSet := false
	appServerSetMode := ""
	var verifiedTitle *string
	verifyError := ""
	if decision.Kind == "renamed" && decision.NewTitle != nil {
		setMode, err := SetThreadNameWithMode(config, threadID, *decision.NewTitle)
		if err != nil {
			LogDecision(config, LogEntry{
				At:               nowString(),
				Level:            "error",
				Event:            eventName,
				Mode:             config.Mode,
				HookEvent:        input.StringField("hook_event_name"),
				ThreadID:         threadID,
				TurnID:           input.StringField("turn_id"),
				Decision:         "failed",
				Reason:           "app-server thread/name/set failed",
				OldTitle:         currentTitle,
				NewTitle:         decision.NewTitle,
				Error:            err.Error(),
				SourceHash:       sourceHash,
				StateTurnOrdinal: state.TurnOrdinal,
				ThreadRead:       threadRead,
				ThreadReadMode:   threadReadMode,
				DurationMs:       time.Since(startedAt).Milliseconds(),
			})
			if suggestOnly {
				return err
			}
			return nil
		}
		appServerSet = true
		appServerSetMode = setMode
		verifiedThread, verifyMode, err := ReadThreadWithMode(config, threadID)
		if err != nil {
			verifyError = err.Error()
		} else if verifyMode != "" {
			threadReadMode = verifyMode
		}
		verifiedTitle = oldTitle(verifiedThread)
	}

	persistDecision := !suggestOnly && config.Mode != ModeDryRun
	appliedState := state
	if persistDecision {
		appliedState = ApplyDecisionToState(state, decision)
		if prompt != nil && appliedState.StableIntent == nil {
			intent := ExtractIntent(prompt.PromptPreview)
			appliedState.StableIntent = &intent
		}
		if decision.Kind == "renamed" {
			appliedState.PendingPrompt = nil
		} else {
			appliedState.PendingPrompt = state.PendingPrompt
		}
	}
	if persistDecision {
		if err := WriteThreadState(config, appliedState); err != nil {
			return err
		}
	}
	LogDecision(config, LogEntry{
		At:               nowString(),
		Level:            "info",
		Event:            eventName,
		Mode:             config.Mode,
		HookEvent:        input.StringField("hook_event_name"),
		ThreadID:         threadID,
		TurnID:           input.StringField("turn_id"),
		Decision:         decision.Kind,
		OldTitle:         decision.OldTitle,
		NewTitle:         decision.NewTitle,
		VerifiedTitle:    verifiedTitle,
		Confidence:       &decision.Confidence,
		Reason:           decision.Reason,
		Signals:          decision.Signals,
		SourceHash:       decision.SourceHash,
		StateTurnOrdinal: appliedState.TurnOrdinal,
		ThreadRead:       threadRead,
		ThreadReadMode:   threadReadMode,
		AppServerSet:     appServerSet,
		AppServerSetMode: appServerSetMode,
		VerifyError:      verifyError,
		DurationMs:       time.Since(startedAt).Milliseconds(),
	})
	if suggestOnly {
		raw, err := json.MarshalIndent(decision, "", "\t")
		if err != nil {
			return err
		}
		raw = append(raw, '\n')
		if _, err := stdout.Write(raw); err != nil {
			return err
		}
	}
	return nil
}

func computeSourceHash(threadID, turnID string, prompt *PendingPrompt, assistantMessage string, transcript TranscriptTail) string {
	promptHash := ""
	if prompt != nil {
		promptHash = prompt.PromptHash
	}
	raw, err := json.Marshal(map[string]any{
		"threadId":          threadID,
		"turnId":            turnID,
		"promptHash":        promptHash,
		"assistantHash":     sha256Hex(assistantMessage),
		"transcriptSignals": transcript.ToolSignals,
	})
	if err != nil {
		return sha256Hex(threadID + turnID + promptHash + sha256Hex(assistantMessage))
	}
	return sha256Hex(string(raw))
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func nowString() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
