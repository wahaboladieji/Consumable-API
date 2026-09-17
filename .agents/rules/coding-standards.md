---
trigger: always_on
---

# coding-standards.md

Applies to every file in this repository. This file governs build correctness and
structural integrity, not taste. If a rule here is broken, the build fails, or the
centralization that security.md and money.md depend on breaks silently. Anything
that is pure style lives in the linter config, not here.

## Build gate

1. The project MUST build with zero TypeScript errors. Strict mode is on in
   `tsconfig.json` and stays on. Do not loosen it to make an error disappear.
2. The project MUST build with zero lint errors. Do not disable a rule inline to
   silence a warning; fix the code or, if the rule is genuinely wrong for this
   codebase, change it in the shared lint config with a comment explaining why.
3. `any` is not allowed except where a third-party type definition leaves no
   alternative, and then only with a `// any: <reason>` comment on that line.
4. Target current Node.js LTS. Do not depend on an API deprecated on that line.

## Structural rules (breaking these is a task failure, not a style note)

5. Every API route validates its input through the shared validation layer in
   `lib/validation/` + `lib/middleware/validate.ts`. Inline, handler-local
   validation is forbidden, even if it produces the correct status code, because
   it duplicates the single source of truth these rules depend on.
6. Every API route shapes its response through the shared envelope helpers in
   `lib/http/envelope.ts`. A handler that builds its own JSON shape is forbidden.
7. Every thrown error is one of the typed classes in `lib/http/errors.ts`, caught
   in one shared error handler. No scattered `try/catch` blocks that duplicate
   status-code mapping logic per handler.
8. Every config value defined in the PRD's configuration table is read only from
   `lib/config.ts`. No `process.env` access anywhere else in the codebase.

## Code quality (recommended, not build-gating, but expected)

9. Small, single-purpose functions. A route file reads top to bottom as:
   validate → do the work → envelope the response. Anything more belongs in `/lib`.
10. Name things after the domain: `restaurant`, `menuItem`, `orderItem`. Do not
    use generic names (`item`, `data`, `obj`) that force the reader to guess.
11. No commented-out code and no `console.log` in anything committed. Use a
    structured logger if logging is genuinely needed.
12. No TODO comments describing work that should already be finished before commit.
13. Every exported function that isn't trivially self-explanatory gets a one-line
    docstring: purpose, inputs, what it throws.
14. Comments explain *why* a non-obvious decision was made, never *what* the next
    line obviously does.

## When unsure

If a coding-standards question isn't answered above, prefer the boring, explicit,
readable option over the clever one. Do not introduce a new pattern, library, or
abstraction to solve a problem this file doesn't anticipate. State the gap and ask.