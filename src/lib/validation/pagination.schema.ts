import { z } from "zod";

/**
 * Shared validation schemas for UUID parameters and query strings.
 * Governance: PRD §6.5 & §8, validation-and-error-mapping/SKILL.md.
 */

export const uuidParamSchema = z.string().uuid({ message: "Invalid UUID format" });

export const idParamSchema = z.object({
  id: uuidParamSchema,
}).strict();
