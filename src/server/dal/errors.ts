/**
 * Typed errors thrown by the DAL. API routes map these to HTTP responses in
 * one place (src/server/api-utils.ts), friendly messages, never stack traces.
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class AuthError extends AppError {
  constructor(message = "Sign in to continue") {
    super("unauthenticated", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to that") {
    super("forbidden", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "That doesn't exist, or it isn't yours") {
    super("not_found", message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = "That input doesn't look right") {
    super("invalid", message, 400);
  }
}

/** A plan limit was reached. Carries what's needed for a friendly upgrade prompt. */
export class LimitError extends AppError {
  readonly limit: "members" | "projects" | "captures";

  constructor(limit: "members" | "projects" | "captures", message: string) {
    super("plan_limit", message, 403);
    this.limit = limit;
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Slow down a touch, try again in a minute") {
    super("rate_limited", message, 429);
  }
}
