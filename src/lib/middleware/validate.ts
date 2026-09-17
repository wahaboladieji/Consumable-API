import { ZodError, ZodType } from "zod";
import { BadRequestError, ValidationError, ValidationErrorDetail } from "../http/errors";

/**
 * Shared validation entry point for request bodies, path params, and query strings.
 * Governance: PRD §8, coding-standards.md rule 5, validation-and-error-mapping/SKILL.md.
 */

/**
 * Validates path parameters or query parameters (400 Bad Request on failure).
 * Supports Zod schemas with input/output transforms.
 */
export function validateParams<Output, Input = unknown>(
  schema: ZodType<Output, any, Input>,
  data: unknown
): Output {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new BadRequestError(`Invalid query or path parameters: ${issues}`);
    }
    throw error;
  }
}

/**
 * Validates request bodies (422 Validation Error on failure).
 */
export function validateBody<Output, Input = unknown>(
  schema: ZodType<Output, any, Input>,
  data: unknown
): Output {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const details: ValidationErrorDetail[] = error.issues.map((issue) => {
        const field = issue.path.join(".") || "body";
        return {
          field,
          issue: issue.message,
        };
      });
      const firstMessage = details[0] ? `${details[0].field}: ${details[0].issue}` : "Validation failed";
      throw new ValidationError(firstMessage, details);
    }
    throw error;
  }
}
