---
name: commit
description: Create focused git commits in this project's Conventional Commit format, the one Commitlint enforces in the commit-msg hook. Invoke automatically whenever the user asks to commit, save changes, or create a commit.
user-invocable: true
argument-hint: what to commit, or a subject hint
allowed-tools: Bash(git *)
disallowed-tools: Read(.env*) Bash(git push*)
---

Arguments, when given, narrow or steer the commit — `/commit the config changes
only`, `/commit mention the parser workaround`. Without them, commit everything
in the working tree that belongs together. Either way, follow this procedure:

1. Run `git status` (never use the `-uall` flag) and `git diff` to understand
   the changes.
2. Group related changes into separate, focused commits. If the changes touch
   different concerns (a bug fix and a refactor, or two unrelated features),
   create several small commits instead of one large one.
3. For each commit, stage only the files relevant to that commit. Stage explicit
   paths — never `git add .` or `git add -A`.
4. Append a description of the AI model that co-authored the commit (for
   example `Claude Opus 5 <noreply@anthropic.com>`).
5. Commit using a HEREDOC with this exact format:

```
type(scope): subject

Optional longer description.

Co-Authored-By: model self-description <model email>
```

## Message rules

Commitlint checks every message in the `commit-msg` hook, so a message that
breaks these rules aborts the commit:

- `type` is one of `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
  `refactor`, `revert`, `style`, `test`, lowercase.
- `scope` is optional and lowercase. Use the area of the project it touches.
- `subject` is lowercase, in the imperative mood, and has no trailing period.
- The whole header is at most 100 characters.
- A blank line separates the header, the body and the trailers. Body and
  trailer lines wrap at 100 characters.
- Mark a breaking change with `!` after the type or scope
  (`feat(api)!: drop the v1 endpoint`), and explain it in a
  `BREAKING CHANGE:` footer.

Examples:

```
feat(module): add runtime configuration
fix: reject invalid module options
chore: bump nuxt to 4.5.1
```

## Rules

- The title focuses on the "why", not the "what".
- Do NOT push to remote unless explicitly asked.
- Do NOT commit files that likely contain secrets (`.env`, credentials, keys).
- Do NOT pass `--no-verify`. If the hook rejects a message, fix the message.
