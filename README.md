# Codex Session Auto Rename

Automatic Codex thread names, only when the task changes.

`codex-session-auto-rename` is a conservative Codex plugin runtime that keeps your session list readable. It captures the latest prompt intent, waits for the assistant turn to finish, and renames the thread only when there is enough signal that the durable task has changed.

It writes titles through Codex app-server metadata with `thread/name/set`, respects manual title edits by default, and does not rewrite transcript JSONL files.

> Developer preview: the Go hook runtime is implemented and tested, but public plugin packaging, release binaries, installer, and uninstall flows are still being prepared.

## Why

Long Codex sessions often outgrow their first title. A thread that starts as `fix failing tests` can turn into release prep, deployment debugging, or an unrelated repository. Renaming on every turn is noisy; never renaming makes old work hard to find.

This plugin chooses the middle path: rename Codex sessions when the durable task changes.

## What It Does

| Behavior | Why it matters |
| --- | --- |
| Watches `UserPromptSubmit` and `Stop` hook events | Captures intent before work starts and decides after the result exists. |
| Uses a local deterministic title engine by default | No LLM call is required for normal title generation. |
| Applies cooldowns, similarity checks, and change signals | Avoids churn from same-task follow-ups. |
| Writes through Codex app-server `thread/name/set` | Updates thread metadata instead of editing transcript files. |
| Respects manual title edits by default | If you rename a thread yourself, the plugin backs off. |
| Logs structured decisions | Skips and renames are inspectable when tuning behavior. |
| Fails open on hook/app-server errors | Codex should keep working even if title automation cannot run. |

## Demo

A Remotion launch demo is planned. It will show the conservative rename flow, skip decisions, manual-title protection, and the app-server title update path without using private transcripts.

Planned assets:

- Demo video: `assets/demo/codex-session-auto-rename-demo.mp4`
- Poster image: `assets/demo/poster.png`
- Storyboard: `docs/demo/storyboard.md`

## Status

The current repository contains the Go runtime under `packages/plugin/` and the archived Bun/TypeScript prototype under `.old/`.

Implemented today:

- `capture`, `decide`, `suggest`, and `version` commands.
- Per-thread state, local title decisions, cooldowns, idempotency tracking, and manual-title detection.
- Codex app-server JSON-RPC reads and title writes.
- Structured JSONL decision logs.
- Go tests for the core title engine.

Not public-install ready yet:

- Codex plugin manifest and bundled lifecycle hooks.
- Prebuilt GitHub Release binaries and checksums.
- Installer, uninstall command, and doctor command.
- Release automation for macOS, Linux, and Windows artifacts.

## Build From Source

For now, use the developer build path:

```sh
cd packages/plugin
go build ./cmd/codex-session-auto-rename
```

Validate the runtime:

```sh
cd packages/plugin
GOCACHE="$PWD/../../.gocache" go test ./...
```

Public installation will target Codex plugin distribution with prebuilt binaries through GitHub Releases. Codex still requires users to review and trust installed hooks with `/hooks`; this project will not bypass that trust step.

## How It Works

1. `UserPromptSubmit` runs `capture` and stores the latest prompt intent for the thread.
2. `Stop` runs `decide` after the assistant finishes.
3. The title engine evaluates the prompt, assistant outcome, transcript tail signals, current title, cooldown state, and manual-title state.
4. If the thread title is generic or the durable task changed, the runtime generates a concise title.
5. In `apply` mode, the runtime calls Codex app-server `thread/name/set`.
6. In `dry-run` mode, the runtime logs the same decision without changing the title.

The runtime does not edit Codex transcript JSONL files.

## Configuration

Runtime config is loaded from:

- `PLUGIN_DATA/config.json` when running inside a plugin data directory.
- Otherwise `~/.codex/codex-session-auto-rename/config.json`.

Default shape:

```json
{
	"enabled": true,
	"mode": "apply",
	"respectManualTitles": true,
	"minSecondsBetweenRenames": 600,
	"minTurnsBetweenRenames": 4,
	"maxTitleLength": 64,
	"codexPath": "codex",
	"appServerTimeoutMs": 1500,
	"stateDir": "~/.codex/codex-session-auto-rename/state",
	"logPath": "~/.codex/codex-session-auto-rename/logs.jsonl",
	"llm": {
		"enabled": false,
		"model": "gpt-5.4-mini",
		"timeoutMs": 2000
	}
}
```

Useful controls:

- Set `"mode": "dry-run"` to inspect decisions without changing titles.
- Set `"mode": "off"` or `"enabled": false` to disable the runtime through config.
- Set `CODEX_AUTO_RENAME_DISABLED=1` as a hard kill switch.
- Keep `"respectManualTitles": true` if manual edits should lock the thread title.

The LLM config is present for future title generation work. The current default path is local and deterministic.

## Privacy And Local State

The runtime is intentionally local-first, but it does store local state.

Reads:

- Hook input for the active Codex turn.
- The current thread record through Codex app-server.
- A tail of the transcript file for recent user/assistant/tool signals.

Writes:

- Thread title metadata through Codex app-server.
- Per-thread state JSON under `stateDir`.
- Decision logs under `logPath`.

Logs contain decision metadata such as hashes, reasons, signals, old/new titles, app-server status, and timing. Prompt text is not logged by default.

State can include a clipped prompt preview and extracted intent so the next `Stop` hook can make a stable decision. Delete `stateDir` and `logPath` to remove the plugin's local memory and logs.

## CLI

```sh
codex-session-auto-rename version
codex-session-auto-rename capture < hook-input.json
codex-session-auto-rename decide < hook-input.json
codex-session-auto-rename suggest < hook-input.json
```

`suggest` returns the rename decision as JSON and behaves like dry-run mode.

## Troubleshooting

If titles never change:

- Confirm the hook is installed and trusted in Codex with `/hooks`.
- Check that `enabled` is true and `mode` is not `off`.
- Check that `CODEX_AUTO_RENAME_DISABLED` is not set to `1`.
- Confirm `codexPath` points to a working `codex` binary.

If a rename is skipped:

- Check `logs.jsonl` for the reason and signals.
- `manual_title_detected` means the current title differs from the last auto title.
- `low_signal` means the turn was not meaningful enough to title.
- `same durable task or cooldown active` means the plugin avoided churn.

If app-server calls fail:

- Increase `appServerTimeoutMs` if local Codex startup is slow.
- Run `codex app-server --stdio` manually to verify Codex app-server availability.
- Inspect `logs.jsonl` for `app-server thread/read unavailable` or `thread/name/set failed`.

## Roadmap

- Package as a Codex plugin with bundled hooks.
- Publish prebuilt binaries and checksums through GitHub Releases.
- Add installer, uninstall, and doctor commands.
- Add a second-stop gate for first-title races.
- Strengthen subagent/root-thread guards.
- Build the planned Remotion launch demo.

## Repository Metadata

Recommended GitHub description:

```text
Conservative Codex plugin that auto-renames sessions when the task changes, without editing transcripts.
```

Recommended topics:

```text
codex, openai-codex, codex-plugin, codex-hooks, codex-cli, codex-session, thread-renaming, session-management, developer-tools, ai-coding, coding-agent, automation, productivity, local-first, privacy, golang, cli-tool, json-rpc, app-server, github-releases
```

## Architecture

Current layout:

```text
packages/plugin/
  cmd/codex-session-auto-rename/
  internal/rename/
```

The root `docs/adr/` directory records the current architecture decisions.
