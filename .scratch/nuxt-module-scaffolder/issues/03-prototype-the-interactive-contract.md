# Prototype the interactive scaffolding contract

Type: prototype
Status: resolved
Blocked by: 02

## Question

What exact prompt sequence, defaults, validation messages, review screen, cancellation behavior, success output, and recovery guidance should `pnpm scaffold` expose so the interactive flow is concise, safe, and ready for human approval?

The prototype must cover valid creation, invalid names, an existing destination, user cancellation, install failure, and formatting failure without implementing the production CLI.

## Comments

- Interactive artifact captured on branch `prototype/interactive-scaffolding-contract` at commit `a2d3c14` (`pnpm prototype:scaffold`). The simulator is intentionally read-only; its production preview covers the proposed wizard and recovery output, while its diagnostic state exposes every transition for review.
- Human verdict: approved as proposed — “seems good.”

## Answer

Adopt the approved interactive contract below.

1. Open with `Scaffold a workspace package`.
2. Prompt for **Template kind** first. Version one presents **Nuxt module** as the single, preselected registry entry; keeping the selection visible establishes the extensible concept without adding a choice that does not yet exist.
3. Prompt for the required **Scaffold name**. For the Nuxt module Template kind, prefill the editable input with the conventional `nuxt-` prefix. The developer may complete that name or erase the prefix and enter a different canonical name. Validate without silently normalizing:
   - Empty: `Enter a scaffold name.`
   - More than 80 characters: `Use 80 characters or fewer.`
   - Anything outside canonical kebab case or beginning with a non-letter: `Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).`
   - Existing target: `packages/<name> already exists. Choose a different scaffold name.`

   Validation and collision errors remain inline at the name prompt, allowing another value; they do not write or delete anything.

4. Prompt for **Description (optional)**, with blank as the default. Trim surrounding whitespace and represent blank as absent rather than inventing copy.
5. Show a review screen before any filesystem write. It lists template kind, `packages/<name>`, `@dphonys/<name>`, the Nuxt module name, camel-case config key, title-cased display name, and the description or `(none)`.
6. Ask `Create this package? (y/N)`, defaulting to **No**. Declining or cancelling anywhere before confirmation ends with `Scaffolding cancelled. No files were changed.`

After confirmation, show three ordered lifecycle steps: **Rendering and validating package**, **Installing workspace dependencies with pnpm**, then **Formatting packages/<name>**. Rendering/validation must finish before the package becomes visible at its destination. Once committed to the destination, later failure or interruption retains the generated package rather than rolling it back.

On success, print:

```text
Created @dphonys/<name> at packages/<name>.

Next steps from the repository root:
  pnpm --filter @dphonys/<name> dev
  pnpm --filter @dphonys/<name> test

Full verification was not run.
```

If installation fails, state that the package was created and retained, then prescribe `pnpm install` followed by `pnpm exec oxfmt packages/<name>`. If formatting fails, state that dependencies are installed and the package was retained, then prescribe `pnpm exec oxfmt packages/<name>` followed by `pnpm --filter @dphonys/<name> test`. An interruption after package creation uses the same retained-package principle and prints both resume commands.

These inline diagnostics and recovery commands are sufficient end-user troubleshooting for version one; no separate troubleshooting document is required. Exact process exit codes and the internal mechanism for detecting/cleaning partial pre-commit work remain with [Design the registry, rendering, and transaction boundaries](04-design-the-registry-rendering-and-transaction-boundaries.md).
