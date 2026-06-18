## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `egorovli/codex-session-auto-rename`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default kebab-case triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with root `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.

### Commit messages

Use Conventional Commits format for every commit, and include a title, body, and footer:

```text
<type>[optional scope]: <short headline>

<body>

<footer>
```

Title:

- Start with a Conventional Commits type such as `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, or `chore`.
- Add a scope when it clarifies the affected area, for example `fix(rename): handle empty session titles`.
- Use `!` after the type or scope for breaking changes, and also include a `BREAKING CHANGE:` footer.
- Keep the headline short and imperative, describing the resulting change.

Body:

- Explain why the change was necessary in distilled form.
- Summarize what changed at the level a reviewer needs to understand the commit.
- Call out material risks, migrations, compatibility notes, or validation performed.
- Prefer concise paragraphs or short bullets when that is clearer than one dense paragraph.

Footer:

- Use Git trailer-style lines for structured metadata.
- Put issue references in a `Refs:` trailer, for example `Refs: #23, #34`.
- Put closing references in the appropriate GitHub trailer when the commit resolves an issue, for example `Closes: #23`.
- Put co-authors in one `Co-authored-by:` trailer per person, for example `Co-authored-by: Name <name@example.com>`.
- Do not insert blank lines between consecutive footer trailers.

Example:

```text
fix(rename): preserve generated title edits

The rename flow could overwrite a user-edited title when the same session was
processed again. Keep the existing manual title as the source of truth and only
apply generated names to sessions that have not been edited.

Risk is limited to the title selection path. Verified with the rename package
tests and a manual dry run against a fixture session.

Refs: #23, #34
Co-authored-by: Name <name@example.com>
```
