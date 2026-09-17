---
trigger: always_on
---

# git-conventions.md

This file is intentionally short. Two rules here are graded directly against the
PRD's submission checklist. Everything else is a recommendation, not a gate.

## Hard rules (graded, non-negotiable)

1. Commit incrementally. The work MUST be visible as a sequence of small,
   reviewable commits that show the build taking shape. A single squashed
   "final commit" containing the entire task is a failed submission regardless
   of what the code does.
2. `.env`, any file containing a real credential, and any database dump are
   NEVER committed, at any point in history, on any branch.
   - `.gitignore` MUST include `.env`, `.env.local`, `*.dump`, `*.sql` (except
     files inside `prisma/migrations/`, which are schema, not data).
   - `.env.example` IS committed, with every key from the PRD's config table
     present and set to a placeholder value, never a real one.
   - Before submission, verify rule 2 by inspecting the repository's full file
     tree in a fresh, unauthenticated (private) browser window, not from local
     memory of what you meant to ignore.

## Recommended (not build-gating)

3. Commit messages describe what changed and, where it isn't obvious, why.
   Conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`) are encouraged for
   readability but not enforced by any check.
4. Group a commit around one logical step (one endpoint, one migration, one
   piece of validation), not around an arbitrary time interval.
5. If working on a branch, branch names describe the work
   (`feat/orders-endpoint`, `fix/rate-limit-headers`), not a generic
   placeholder like `patch-1`.

## When unsure

If uncertain whether something belongs in a commit or in `.gitignore`, exclude it
and ask, rather than commit it and clean up later. History is hard to fully erase.