export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const TOKEN_STORAGE_KEY = "af_session_token";

export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredToken = (token: string | null): void => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    method,
    credentials: "include",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

export const subscribeProjectEvents = (
  projectId: string,
  onEvent: (eventName: string, payload: unknown) => void,
): (() => void) => {
  const token = getStoredToken();
  const url = token
    ? `/api/projects/${encodeURIComponent(projectId)}/events?token=${encodeURIComponent(token)}`
    : `/api/projects/${encodeURIComponent(projectId)}/events`;
  const source = new EventSource(url, { withCredentials: true });

  const eventTypes = [
    "connected",
    "run.started",
    "run.completed",
    "step.started",
    "step.completed",
    "step.failed",
    "message.created",
    "checkpoint.created",
    "log",
  ];
  for (const name of eventTypes) {
    source.addEventListener(name, (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data);
        onEvent(name, parsed);
      } catch {
        onEvent(name, (ev as MessageEvent).data);
      }
    });
  }
  return () => source.close();
};
