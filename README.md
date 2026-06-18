# Codex Session Auto Rename

Automatic Codex thread names, only when the task changes.

`codex-session-auto-rename` is a conservative Codex plugin runtime that keeps your session list readable. It captures the latest prompt intent, waits for the assistant turn to finish, and renames the thread only when there is enough signal that the durable task has changed.

It was designed to write titles through Codex app-server metadata with `thread/name/set`, respect manual title edits by default, and avoid rewriting transcript JSONL files. During testing we found an important Codex integration limitation: we have not found a supported way for a hook or plugin to inject a live session rename into the active Codex UI.

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
| Attempts Codex app-server `thread/name/set` | Uses the clean metadata path when available, but this has not proven sufficient to rename the active visible session in current Codex builds. |
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

### Current Limitation: No Clean Live Session Rename Injection

The project can generate reasonable titles, track per-thread state, log decisions, and attempt the clean app-server metadata call. What we have not found is a suitable supported mechanism for a Codex hook to make the currently open session visibly rename itself.

The distinction matters:

- Persisted thread metadata and the live Codex session title are not the same thing in the environments tested.
- Calling Codex app-server JSON-RPC `thread/name/set` can update metadata in a separate app-server context, but the running Codex UI may not be connected to that same app-server instance.
- When the hook falls back to `codex app-server --stdio`, it talks to a fresh process. That process can read/write thread data, but it does not notify the already-running UI.
- The visible session title appears to update reliably only through Codex's own interactive rename flow, such as the `/rename` command entered by the user in the active session.

We also tested whether `UserPromptSubmit` could carry hidden-ish hook context asking the next model turn to rename the session. That context reached the model, but it only showed up as model context. It did not expose a callable rename capability, and it did not execute `/rename`. The experiment was removed because it was noisy and did not solve the problem.

We intentionally did not keep keystroke-injection workarounds. Driving the UI by sending `/rename` text into a terminal, cmux pane, or other remote-control surface could make the title change in some setups, but that is not a clean plugin API. It is brittle, environment-specific, and easy to aim at the wrong surface. This repository is currently scoped to a supported Codex integration path, not UI automation.

For now, the honest project state is:

- The title decision engine and diagnostics are useful.
- The hook can observe turns and decide what the title should be.
- The hook can log the intended rename and app-server behavior.
- The hook cannot yet reliably rename the active visible Codex session through a clean supported API.

The project should stay in developer-preview status until Codex exposes one of the following:

- A hook-safe current-thread rename API.
- An app-server socket or proxy that hooks can discover for the exact running UI instance.
- An assistant/tool capability equivalent to `/rename` for the active session.
- A documented hook output contract for requesting a session title change.

Implemented today:

- `capture`, `decide`, `suggest`, and `version` commands.
- Per-thread state, local title decisions, cooldowns, idempotency tracking, and manual-title detection.
- Codex app-server JSON-RPC reads and attempted title writes, with diagnostics for which transport was used.
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
make test
```

Run the strict Go lint gate:

```sh
make lint
```

Run the full local quality gate:

```sh
make check
```

The lint policy uses golangci-lint v2 with an explicit linter list. It includes
the standard correctness set (`errcheck`, `govet`, `ineffassign`,
`staticcheck`, and `unused`) plus targeted checks for error handling, security,
unreachable cleanup mistakes, misspellings, unused conversions/parameters,
bounded cognitive complexity, and `nolint` hygiene. It intentionally avoids
`all`, size metrics, formatting wars, and broad style-only rules so CI stays
strict without becoming noisy.

If `golangci-lint` is not installed locally:

```sh
make install-golangci-lint
```

Public installation will target Codex plugin distribution with prebuilt binaries through GitHub Releases. Codex still requires users to review and trust installed hooks with `/hooks`; this project will not bypass that trust step.

## How It Works

1. `UserPromptSubmit` runs `capture` and stores the latest prompt intent for the thread.
2. `Stop` runs `decide` after the assistant finishes.
3. The title engine evaluates the prompt, assistant outcome, transcript tail signals, current title, cooldown state, and manual-title state.
4. If the thread title is generic or the durable task changed, the runtime generates a concise title.
5. In `apply` mode, the runtime calls Codex app-server `thread/name/set`.
6. In `dry-run` mode, the runtime logs the same decision without changing the title.

The runtime does not edit Codex transcript JSONL files. At the moment, step 5 should be read as "attempt the clean metadata update", not "guarantee the active UI title changes".

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
- Check whether logs show `appServerSetMode:"stdio"`. If so, the hook used a separate stdio app-server process, which is not expected to notify the running Codex UI.
- If `newTitle` is present but the visible session title does not change, you are probably hitting the known live-rename limitation described above.

If a rename is skipped:

- Check `logs.jsonl` for the reason and signals.
- `manual_title_detected` means the current title differs from the last auto title.
- `low_signal` means the turn was not meaningful enough to title.
- `same durable task or cooldown active` means the plugin avoided churn.

If app-server calls fail:

- Increase `appServerTimeoutMs` if local Codex startup is slow.
- Run `codex app-server --stdio` manually to verify Codex app-server availability.
- Inspect `logs.jsonl` for `app-server thread/read unavailable` or `thread/name/set failed`.
- If app-server calls succeed but `verifiedTitle` does not match `newTitle`, the metadata write itself did not stick.
- If app-server calls succeed and `verifiedTitle` matches `newTitle`, but the Codex UI still shows the old name, the write reached metadata but not the live UI session.

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
