# Use Go for the Hook Runtime

We will port the shipped hook runtime from Bun/TypeScript to Go. The hook runs on every relevant Codex turn, so it should start quickly and avoid requiring users to install Bun, Node, Python, Deno, Rust, or any other language runtime. Go gives us a small, dependency-light native executable with straightforward cross-platform path handling and cross-compilation, which is a better redistribution target than relying on an interpreter already being present.

**Considered Options**

- Keep Bun/TypeScript: fastest path from the current implementation, but requires Bun or a compiled Bun runtime and keeps distribution tied to a niche runtime.
- Use Node or Python: familiar ecosystems, but neither is a reliable out-of-the-box runtime across macOS, Linux, and Windows.
- Use Rust: technically strong, but higher implementation and release maintenance cost for a small hook tool.
