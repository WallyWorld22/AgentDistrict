/**
 * Typed errors shared by both repository adapters, `lib/auth` and every
 * `/api/v1` route handler.
 *
 * The API surface renders these as `{ error: { code, message } }` with the
 * status carried on the error itself (BUILD_SPEC §4), so a route handler never
 * has to map domain failures onto HTTP by hand.
 */

export const ERROR_CODES = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "insufficient_funds",
  "not_supported",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  insufficient_funds: 402,
  not_supported: 501,
  internal: 500,
};

/** Base class for every failure the District raises on purpose. */
export class DistrictError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DistrictError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export class NotFoundError extends DistrictError {
  constructor(what: string) {
    super("not_found", `${what} not found`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends DistrictError {
  constructor(message: string, details?: unknown) {
    super("invalid_request", message, details);
    this.name = "ValidationError";
  }
}

export class AuthRequiredError extends DistrictError {
  constructor(message = "Authentication required") {
    super("unauthorized", message);
    this.name = "AuthRequiredError";
  }
}

export class ForbiddenError extends DistrictError {
  constructor(message = "You do not have access to this resource") {
    super("forbidden", message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends DistrictError {
  constructor(message: string) {
    super("conflict", message);
    this.name = "ConflictError";
  }
}

export class InsufficientFundsError extends DistrictError {
  constructor(message = "Not enough available credits for this order") {
    super("insufficient_funds", message);
    this.name = "InsufficientFundsError";
  }
}

/** Raised by the Supabase adapter when Postgres rejects a statement. */
export class UpstreamError extends DistrictError {
  constructor(message: string, details?: unknown) {
    super("internal", message, details);
    this.name = "UpstreamError";
  }
}

export function isDistrictError(value: unknown): value is DistrictError {
  return value instanceof DistrictError;
}

/** Normalise anything thrown into a `DistrictError`. */
export function toDistrictError(value: unknown): DistrictError {
  if (isDistrictError(value)) return value;
  if (value instanceof Error) return new UpstreamError(value.message);
  return new UpstreamError("Unexpected error");
}
