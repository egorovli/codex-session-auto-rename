package rename

import (
	"slices"
	"strings"
	"testing"
)

func TestRenamesGenericTitleAfterMeaningfulPrompt(t *testing.T) {
	config := DefaultConfig()
	config.Mode = ModeDryRun
	state := InitialThreadState("thread-1")
	cwd := "/tmp/project"
	prompt := CreatePendingPrompt(
		"turn-1",
		"Build a Bun TypeScript Codex hook that auto renames thread titles",
		&cwd,
	)
	title := "New chat"

	decision := DecideRename(DecideInput{
		Config:           config,
		State:            &state,
		Thread:           &ThreadRecord{ID: "thread-1", Name: &title},
		Prompt:           &prompt,
		AssistantMessage: "Implemented the package and tests.",
		Transcript:       TranscriptTail{ToolSignals: []string{"edited files"}},
		SourceHash:       "source-1",
	})

	if decision.Kind != "would_rename" {
		t.Fatalf("expected would_rename, got %s", decision.Kind)
	}
	if decision.NewTitle == nil {
		t.Fatal("expected new title")
	}
	if !strings.Contains(*decision.NewTitle, "Codex") || !strings.Contains(*decision.NewTitle, "Auto") {
		t.Fatalf("expected Codex Auto title, got %q", *decision.NewTitle)
	}
}

func TestSkipsSameTaskFollowUpUnderCooldown(t *testing.T) {
	config := DefaultConfig()
	config.Mode = ModeDryRun
	state := InitialThreadState("thread-1")
	cwd := "/tmp/project"
	firstPrompt := CreatePendingPrompt("turn-1", "Research Codex auto rename hooks", &cwd)
	title := "New chat"

	firstDecision := DecideRename(DecideInput{
		Config:           config,
		State:            &state,
		Thread:           &ThreadRecord{ID: "thread-1", Name: &title},
		Prompt:           &firstPrompt,
		AssistantMessage: "Researched Codex hooks and app server thread naming.",
		Transcript:       TranscriptTail{},
		SourceHash:       "source-1",
	})
	nextState := ApplyDecisionToState(state, firstDecision)
	if firstDecision.NewTitle == nil {
		t.Fatal("expected first decision to produce a title")
	}

	followUp := CreatePendingPrompt("turn-2", "Can you add tests for that same hook?", &cwd)
	followUpTitle := *firstDecision.NewTitle
	followUpDecision := DecideRename(DecideInput{
		Config:           config,
		State:            &nextState,
		Thread:           &ThreadRecord{ID: "thread-1", Name: &followUpTitle},
		Prompt:           &followUp,
		AssistantMessage: "Added tests for the same hook.",
		Transcript:       TranscriptTail{ToolSignals: []string{"tests"}},
		SourceHash:       "source-2",
	})

	if followUpDecision.Kind != "skipped" {
		t.Fatalf("expected skipped, got %s", followUpDecision.Kind)
	}
}

func TestDetectsManualTitleOverride(t *testing.T) {
	config := DefaultConfig()
	config.Mode = ModeDryRun
	config.RespectManualTitles = true
	state := InitialThreadState("thread-1")
	lastAutoTitle := "Codex Auto Rename Hook"
	state.LastAutoTitle = &lastAutoTitle
	cwd := "/tmp/project"
	intent := CreatePendingPrompt("turn-1", "Codex auto rename hook", &cwd).Intent
	state.StableIntent = &intent
	prompt := CreatePendingPrompt("turn-2", "Switch gears and research mobile SQLCipher boot errors", &cwd)
	manualTitle := "My Hand Picked Title"

	decision := DecideRename(DecideInput{
		Config:           config,
		State:            &state,
		Thread:           &ThreadRecord{ID: "thread-1", Name: &manualTitle},
		Prompt:           &prompt,
		AssistantMessage: "Researched SQLCipher boot handling.",
		Transcript:       TranscriptTail{},
		SourceHash:       "source-2",
	})

	if decision.Kind != "skipped" {
		t.Fatalf("expected skipped, got %s", decision.Kind)
	}
	if !slices.Contains(decision.Signals, "manual_title_detected") {
		t.Fatalf("expected manual_title_detected signal, got %#v", decision.Signals)
	}
}
