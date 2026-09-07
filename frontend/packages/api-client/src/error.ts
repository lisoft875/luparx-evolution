import type { ProblemDetails } from './types/http';

/**
 * Thrown for every non-2xx response. Wraps the RFC 9457 Problem Details body
 * (CONTRACT.md §4) so callers can branch on the stable `code`, surface
 * `errors[]` next to form fields, and log `traceId` for support correlation.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly instance?: string;
  readonly traceId?: string;
  readonly errors: ProblemDetails['errors'];

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.type = problem.type;
    this.instance = problem.instance;
    this.traceId = problem.traceId;
    this.errors = problem.errors;
  }

  fieldError(field: string): string | undefined {
    return this.errors?.find((error) => error.field === field)?.message;
  }
}

/** Raised when the network itself fails (offline, DNS, CORS) — never a server-produced Problem Details body. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}
