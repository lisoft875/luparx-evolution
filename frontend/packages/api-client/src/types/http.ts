/** CONTRACT.md §4 — all collections are paginated with this exact envelope. */
export interface PagedResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export type PageParams = {
  page?: number;
  size?: number;
  sort?: string;
};

/** RFC 9457 Problem Details field-level validation error (CONTRACT.md §4). */
export interface ProblemFieldError {
  field: string;
  code: string;
  message: string;
}

/** RFC 9457 `application/problem+json` body shape, exactly as CONTRACT.md §4 defines it. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  traceId?: string;
  errors?: ProblemFieldError[];
}
