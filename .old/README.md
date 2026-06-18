# Codex Session Auto Rename

Bun + TypeScript hooks for conservative automatic Codex thread title updates.

The hook updates the Codex thread name only when the durable task changes. It does not rename on
blind timers and it does not rewrite Codex transcript files. The write path is Codex app-server
JSON-RPC, currently `thread/name/set`.

## Behavior

- `UserPromptSubmit` captures the latest user intent into local state.
- `Stop` decides after the completed turn whether the thread title should change.
- The default title engine is local and deterministic.
- Codex-as-LLM title generation exists as an opt-in fallback, but is disabled by default.
- Manual title edits are respected by default. If the current title differs from the last title this
  package set, the thread is locked unless `force` is enabled.

## Install

From this directory:

```sh
bun install
bun run install:global
```

The installer copies this package to `~/.codex/codex-session-auto-rename` and merges hook entries into
`~/.codex/hooks.json`. Existing hooks are preserved.

Review and trust the new hooks in Codex with `/hooks`.

## Config

The installer creates `~/.codex/codex-session-auto-rename/config.json` if it does not exist:

```json
{
	"enabled": true,
	"mode": "apply",
	"respectManualTitles": true,
	"minSecondsBetweenRenames": 600,
	"minTurnsBetweenRenames": 4,
	"maxTitleLength": 64,
	"logPrompts": false,
	"appServerTimeoutMs": 1500,
	"llm": {
		"enabled": false,
		"model": "gpt-5.4-mini",
		"timeoutMs": 2000
	}
}
```

Set `mode` to `dry-run` to log decisions without changing titles.

Hard kill switch:

```sh
export CODEX_AUTO_RENAME_DISABLED=1
```

## Logs

Decision logs are written to:

```text
~/.codex/codex-session-auto-rename/logs.jsonl
```

Logs contain hashes, decisions, reasons, and title metadata. Prompt text is not logged by default.

## Development

```sh
bun test
bun run lint
bun run typecheck
```
