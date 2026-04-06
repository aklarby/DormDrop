const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type FetchOptions = RequestInit & {
  token?: string;
};

async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    headers,
    ...rest,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T = unknown>(path: string, token?: string) =>
    apiFetch<T>(path, { method: "GET", token }),

  post: <T = unknown>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body), token }),

  patch: <T = unknown>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body), token }),

  delete: <T = unknown>(path: string, token?: string) =>
    apiFetch<T>(path, { method: "DELETE", token }),
};
