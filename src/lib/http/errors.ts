/**
 * Typed error classes for application-wide error handling.
 * Governance: PRD §6.3, AGENTS.md §4, coding-standards.md rule 7.
 */

export interface ValidationErrorDetail {
  field: string;
  issue: string;
}

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly details?: ValidationErrorDetail[];

  constructor(message: string, details?: ValidationErrorDetail[]) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly code = "BAD_REQUEST";
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = "VALIDATION_ERROR";

  constructor(message: string | ValidationErrorDetail[], details?: ValidationErrorDetail[]) {
    if (Array.isArray(message)) {
      super("Validation failed", message);
    } else {
      super(message, details);
    }
  }
}

export class RateLimitedError extends AppError {
  readonly statusCode = 429;
  readonly code = "RATE_LIMITED";
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = "Too many requests. Please try again later.") {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class InternalServerError extends AppError {
  readonly statusCode = 500;
  readonly code = "INTERNAL_ERROR";

  constructor(message = "An internal server error occurred") {
    super(message);
  }
}
