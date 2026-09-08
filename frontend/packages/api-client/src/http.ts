import { ApiError, NetworkError } from './error';
import type { ProblemDetails } from './types/http';
import type { TokenPair } from './types/domain';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Injected at the infrastructure boundary (dependency inversion): api-client
 * knows nothing about *where* tokens live — @luparx/auth supplies a
 * portal-scoped implementation backed by its own isolated storage.
 */
export interface TokenProvider {
  getAccessToken(): string | null;
  /** Performs the refresh-token exchange and persists the new pair. Returns null when refresh itself fails (reuse detected, expired, etc.). */
  refreshTokens(): Promise<TokenPair | null>;
  /** Called when refresh fails and the caller must be treated as signed out. */
  onSessionExpired(): void;
}

export interface HttpClientOptions {
  baseUrl: string;
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
  /** Extra headers merged into every request, e.g. `Accept-Language`. */
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Marks a mutating write as safe to retry verbatim; a fresh UUID is generated per logical operation, not per network attempt. */
  idempotent?: boolean;
  /** Skip Authorization header (public catalog / auth endpoints before login). */
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** RFC 4122 v4 UUID via the Web Crypto API, used for `Idempotency-Key`. */
function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older WebViews).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function parseProblemDetails(response: Response): Promise<ProblemDetails> {
  try {
    const body = (await response.json()) as Partial<ProblemDetails>;
    return {
      type: body.type ?? 'about:blank',
      title: body.title ?? response.statusText,
      status: body.status ?? response.status,
      detail: body.detail,
      instance: body.instance,
      code: body.code ?? 'UNKNOWN_ERROR',
      traceId: body.traceId,
      errors: body.errors,
    };
  } catch {
    return {
      type: 'about:blank',
      title: response.statusText || 'Request failed',
      status: response.status,
      code: response.status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR',
    };
  }
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private refreshInFlight: Promise<TokenPair | null> | null = null;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.tokenProvider = options.tokenProvider;
    // `fetch` keeps `globalThis` as its receiver: storing it in a field and calling
    // `this.fetchImpl(...)` makes the HttpClient the receiver, which browsers reject with
    // "Illegal invocation" before the request ever leaves — surfacing as a bogus network error.
    // The mock transport is a plain function and never hit this, which is why only the real
    // backend was affected.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.execute(method, path, options, /* isRetry */ false);
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private async execute(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
    isRetry: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.idempotent) {
      headers['Idempotency-Key'] = generateIdempotencyKey();
    }
    if (options.auth !== false && this.tokenProvider) {
      const token = this.tokenProvider.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}${buildQuery(options.query)}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
        // An authenticated GET answers "…for this user, in this municipality", but the browser's
        // HTTP cache is keyed by URL and does not look at `Authorization` unless the response says
        // to. The server answers tenant-scoped reads (e.g. `GET /citizen/parking/zones`) with
        // `Cache-Control: max-age=60, private` and no `Vary: Authorization`, so without this a
        // switch of municipality would be followed, for a full minute, by the PREVIOUS
        // municipality's body — the same URL, a different tenant, and no request ever reaching the
        // server to disagree. That is not a stale label on a screen: it is one municipality's zones
        // and prices presented as another's.
        //
        // `cache: 'no-store'` is the whole fix, and deliberately not a `Cache-Control` request
        // header. It instructs fetch to bypass the HTTP cache in both directions — the response is
        // never read from the store and never written to it — which is strictly stronger than the
        // `no-cache` header it replaces, and it is a property of the fetch call rather than
        // something sent on the wire. That distinction matters: `Cache-Control` is not a
        // CORS-safelisted request header, so sending it made every authenticated GET preflight and
        // then fail outright against a server whose `Access-Control-Allow-Headers` does not name it
        // — which is every deployment of this API today. The same protection, no preflight, nothing
        // for the server to allow-list.
        //
        // The durable server-side fix (`Vary: Authorization`, or `private, no-store` on
        // tenant-scoped reads) is still worth having; this stays correct once it lands.
        cache: 'no-store',
      });
    } catch (cause) {
      throw new NetworkError(cause);
    }

    if (response.status === 401 && !isRetry && options.auth !== false && this.tokenProvider) {
      const refreshed = await this.refreshOnce();
      if (refreshed) {
        return this.execute(method, path, options, true);
      }
      this.tokenProvider.onSessionExpired();
    }

    if (!response.ok) {
      throw new ApiError(await parseProblemDetails(response));
    }

    return response;
  }

  private refreshOnce(): Promise<TokenPair | null> {
    if (!this.tokenProvider) return Promise.resolve(null);
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.tokenProvider
        .refreshTokens()
        .finally(() => {
          this.refreshInFlight = null;
        });
    }
    return this.refreshInFlight;
  }
}
