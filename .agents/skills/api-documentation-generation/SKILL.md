---
name: api-documentation-generation
description: Use after an endpoint's route and validation schema are finalized, before marking its README documentation complete. Teaches how to derive an endpoint's documented parameters from its actual validation schema and produce a real, executed curl example instead of an invented one, so the README stays truthful to the code.
---

# API Documentation Generation

PRD §13 specifies exactly which sections the README needs and in what order. This skill covers something that section doesn't: how to make sure what gets written is actually true. The README's own acceptance test, stated in the PRD, is that a stranger can use the API successfully from the README alone. A curl example that was typed from memory instead of actually run against the running API fails that test the moment a field name is off by one character.

## The rule this skill exists to enforce

**Never write a documented parameter, field name, or example response by recalling the schema from memory. Derive it from the actual schema file, and produce the example response by actually running the request.**

This matters because schemas get adjusted during implementation — a field gets renamed, a default changes, a new filter gets added — and documentation written before those adjustments silently goes stale. Documentation is not a summary of intent, it's a report of what the code, right now, actually does.

## Per-endpoint procedure

For each endpoint, in this order:

1. **Open the actual route file and its validation schema.** Read the real list of accepted query parameters (from `lib/validation/pagination.schema.ts` plus the endpoint's own filter fields) or the real request body shape (from the resource's `*.schema.ts`). Do not write the parameter table from the PRD's description of the endpoint — the PRD describes intent, the schema file is the implementation. If they disagree, the schema is what's true, and that disagreement is worth flagging.

2. **List every parameter with its real type and real default**, taken directly from the Zod schema. A field marked `.optional()` is documented as optional. A field with `.default(20)` is documented with that literal default, not a rounded or remembered approximation.

3. **Run the request for real** against a running instance (local or deployed) with actual seeded data, and capture the actual response. This means:
   - Get a real id from the seeded database (e.g. `SELECT id FROM restaurants LIMIT 1` or a quick unfiltered list call) rather than inventing a plausible-looking UUID.
   - Run the curl command exactly as it will appear in the README.
   - Copy the real response body into the documentation, not a hand-written approximation of what the shape "should" look like.

4. **Write the curl example in copy-pasteable form**, using the real base URL (or a placeholder the reader is told to substitute, clearly marked), the real path, and real example parameter values:

   ```bash
   curl "https://<your-deployed-url>/api/v1/restaurants?limit=5&city=Lagos&sort=rating&order=desc"
   ```

5. **Include one example of the error shape** for at least the endpoints where a 422 or 404 is meaningful (order creation and any `:id` endpoint), captured the same way — actually trigger the error and copy the real response, rather than writing the error envelope from the general shape in PRD §6.2 alone. The general shape is correct, but the specific `message` text should match what the code actually produces.

## What goes in each endpoint's documentation block

Per PRD §13, item 5, every endpoint entry needs:

- Method and path
- Every query parameter, with type and default (from step 2)
- A curl example (from step 4)
- An example response (from step 3)

Keep the ordering of endpoints in the README consistent with the order they're listed in PRD §6.4, so a reader scanning the table of endpoints can find the matching detailed section without hunting.

## Writing the "Design decisions" section

This section is prose, not a parameter table, but it has the same truthfulness requirement: don't restate PRD language from memory, write the actual reasoning as it applies to what was actually built. If an implementation detail changed during the build (e.g. a different index was needed than originally planned), the design decisions section should reflect what's actually in the schema, not the PRD's original plan.

The PRD requires this section to answer, at minimum: why these resources, why generated identifiers, why cursor pagination and when offset would be better, what the envelope shape is and why, why money is integer minor units, and where the rate limit and pagination numbers live. Each answer should be checkable against the actual code (point at the actual file, e.g. "see `lib/config.ts`," rather than describing it abstractly).

## Self-check before considering the README done

- Pick three documented parameters at random and open the actual schema file. Do the documented type and default match exactly?
- Pick one documented curl example and actually run it right now. Does the real response match what's written?
- Does every endpoint in PRD §6.4's table have a corresponding documented section, in the same order?
- Does the Design decisions section point at real file paths rather than describing things only in the abstract?
