# Distribute as a Codex Plugin

We will package the Codex integration as a Codex plugin with bundled lifecycle hooks. The behavior depends on Codex hook events such as `UserPromptSubmit` and `Stop`, so plugin packaging is the most native way to install, enable, disable, and share the integration inside Codex. Direct binary installers can remain as fallback or developer paths, but the primary Codex-facing distribution model should be a plugin distributed through a Git-backed marketplace until public plugin publishing is mature enough for this package.

**Consequences**

Plugin installation does not bypass Codex hook trust. Users still need to review and trust the plugin-bundled hooks in `/hooks`, and the documentation must treat that as an explicit install step. Hook commands should resolve runtime assets through plugin-provided paths such as `PLUGIN_ROOT` and store mutable state under plugin data rather than hardcoded user-local package paths.
