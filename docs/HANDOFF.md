# codex-session-auto-rename handoff

Date: 2026-06-18

## Current state

This repository is a cleaned redistributable copy of the local Codex auto-rename hook that was first installed under `~/.codex/auto-rename`.

The package now uses the public-facing name `codex-session-auto-rename`. Runtime install path in this copy is `~/.codex/codex-session-auto-rename`; the original live install on this machine may still be under `~/.codex/auto-rename` until reinstalled from this project.

Runtime state and logs were intentionally not copied. The project includes `config.example.json`; the installer creates the real user-local config at install time.

## Implemented behavior

- `UserPromptSubmit` hook captures the latest prompt intent into per-thread local state.
- `Stop` hook decides whether to rename after the assistant finishes.
- Renaming is conservative: it should happen on a significant task/direction change, not every turn and not on a blind timer.
- Default title engine is deterministic/local. The LLM path is present in config shape but intentionally disabled by default.
- Thread writes use Codex app-server JSON-RPC `thread/name/set`.
- The implementation does not edit transcript JSONL files.
- Manual title edits are respected by default when the current title differs from the last title set by this package.
- Hook failures are intended to fail open and log decisions rather than block Codex.

## Validation already done

- TypeScript source was installed and exercised locally from the original package.
- `bun test` passed for title-engine tests before this handoff copy was made.
- `bun run typecheck` passed before this handoff copy was made.
- A dry-run hook simulation produced a valid would-rename decision.
- An apply test successfully created a temporary Codex thread, set its title through app-server, verified the title, and archived the temporary thread.
- `codex doctor --summary` had unrelated pre-existing network/thread inventory warnings, but config loading and title configuration were functional.

Before publishing, rerun validation from this copied project because the package name and install path were changed here.

Recommended commands:

```sh
bun install
bun test
bun run typecheck
bun run lint
CODEX_AUTO_RENAME_MODE=dry-run bun src/auto-rename.ts suggest
```

## Related prior art

- `gaelic-ghost/socket` has a `codex-utilities` plugin with thread-title hooks. It validates the app-server approach, but mainly prefixes Codex-generated titles with project context rather than detecting semantic direction changes.
  - https://github.com/gaelic-ghost/socket/blob/main/plugins/codex-utilities/docs/thread-title-hooks.md
- `celloagentclub/rename-codex-threads` is a manual Codex skill for current/batch thread title rewriting.
  - https://github.com/celloagentclub/rename-codex-threads
- `daxliniere/VS-Codex-Thread-Tools-renamer-search` is a Windows GUI for direct local thread-file edits. Treat that as a manual utility, not the safe write path for this package.
  - https://github.com/daxliniere/VS-Codex-Thread-Tools-renamer-search
- OpenAI Codex moved thread names to app-server metadata and exposes `thread/name/set`.
  - https://github.com/openai/codex/commit/2c1a361a2e7232b8177ea0ea651dfcc616be895d

## Open decisions before redistribution

1. Package shape
   Decide whether this should be a GitHub repo, npm package, Codex plugin, Codex skill, or a small installer repo. A Codex plugin is probably the best user experience if third-party hook distribution is stable enough.

2. Runtime dependency
   The current package assumes Bun. For broader distribution, consider compiling to a single Node-compatible JS file or shipping a small Node package. Hook startup latency matters.

3. Install and uninstall
   Add an explicit uninstall command that removes only this package's hook entries and runtime files. The current installer backs up `hooks.json` and preserves other hooks, but there is no uninstall path yet.

4. Hook trust
   Codex requires the user to review/trust new hooks in `/hooks`. Do not attempt to bypass this in an installer. Documentation should make this explicit.

5. First-stop race
   Consider borrowing Socket's pattern of waiting until the second `Stop` before the first rename. Codex can generate or rewrite its own title after the first turn.

6. Hook identity
   Upstream Codex changed hook session IDs so subagents can share a root session identity. The implementation validates `thread/read`, but redistribution should add a stronger guard so subagent hooks do not unexpectedly rename the parent thread.

7. Cross-platform defaults
   Current defaults use macOS Homebrew paths for `codex` and `bun`. Detect paths at install time and store them in user config, or rely on PATH with clear diagnostics.

8. Privacy posture
   Logs currently avoid prompt text by default. Keep that default. Document exactly what is logged, how to turn logging down/off, and how to delete state.

9. Title policy
   The core product decision is whether to replace titles, prefix titles, or preserve generated titles unless the user changes direction. The current package chooses replacement on significant direction change.

## Suggested next implementation pass

- Rerun tests from `~/Dev/codex-session-auto-rename` after copying.
- Add `uninstall` and `doctor` commands.
- Add a second-stop gate for the first rename.
- Add subagent/root-thread guard tests.
- Replace macOS-specific path defaults with install-time detection.
- Update README into publishable installation, configuration, privacy, troubleshooting, and trust-review sections.
- Create a minimal release checklist.
