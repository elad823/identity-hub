// One fetch wrapper: sends JSON and turns error responses into ApiError with a human message.
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

// App registers one handler so any expired session sends the user back to the login screen.
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ApiError('The server took too long to respond. Try again.', 'TIMEOUT');
    }
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 'NETWORK');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    // 401 on a data call means the session ended. The auth routes handle their own 401s (wrong password, not signed in).
    if (err?.code === 'UNAUTHENTICATED' && !path.startsWith('/api/auth/')) onSessionExpired?.();
    throw new ApiError(err?.message ?? 'Something went wrong. Try again.', err?.code ?? 'UNKNOWN', err?.fields ?? {});
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Try again.';
}
