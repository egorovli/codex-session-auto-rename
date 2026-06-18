# codex-session-auto-rename

Codex plugin runtime for conservative automatic Codex thread title updates.

The project is being ported from the original Bun/TypeScript implementation to a Go runtime packaged as a Codex plugin. The archived TypeScript implementation lives under `.old/`.

## Current layout

```text
packages/plugin/
  cmd/codex-session-auto-rename/
  internal/rename/
```

## Validate

```sh
cd packages/plugin
GOCACHE="$PWD/../../.gocache" go test ./...
```

The root `docs/adr/` directory records the current architecture decisions.
