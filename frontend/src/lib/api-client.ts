const configuredApiUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api"
).replace(/\/$/, "");

export function getApiUrl() {
  if (typeof window === "undefined") return configuredApiUrl;
  const url = new URL(configuredApiUrl, window.location.origin);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    url.hostname = window.location.hostname;
  }
  return url.toString().replace(/\/$/, "");
}

export async function responseError(response: Response) {
  const detail = await response.text();
  return `${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
}

async function getCsrfToken() {
  const response = await fetch(`${getApiUrl()}/auth/csrf/`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await responseError(response));
  const data = (await response.json()) as { csrfToken?: string };
  if (!data.csrfToken) throw new Error("The backend did not provide a CSRF token.");
  return data.csrfToken;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    headers.set("X-CSRFToken", await getCsrfToken());
  }
  return fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}
