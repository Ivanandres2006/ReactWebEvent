// src/lib/authClient.js
const API = 'https://backendevent-etce.onrender.com';

export function normalizeToken(t) {
  if (!t) return '';
  return t.startsWith('Bearer ') ? t.slice(7) : t;
}

export function getAccessToken() {
  return normalizeToken(localStorage.getItem('token') || '');
}

export function getRefreshToken() {
  return localStorage.getItem('refreshToken') || '';
}

export function saveTokens({ accessToken, token, refreshToken }) {
  const t = normalizeToken(token || accessToken || '');
  if (t) localStorage.setItem('token', t);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  // let listeners (RegisterPopup, etc.) re-read tokens
  window.dispatchEvent(new Event('auth:login'));
}

export function clearTokens() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
}

function isExpired(jwt) {
  try {
    const [, b] = jwt.split('.');
    if (!b) return false;
    const payload = JSON.parse(atob(b.replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.exp ? Date.now() >= payload.exp * 1000 : false;
  } catch { return false; }
}

async function refreshIfNeeded() {
  const rt = getRefreshToken();
  if (!rt) return null;
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  saveTokens({ accessToken: j.accessToken || j.token, refreshToken: j.refreshToken });
  return getAccessToken();
}

/**
 * Use this instead of fetch() for any authenticated request.
 * - Adds Authorization header
 * - If 401, tries one refresh and retries once
 */
export async function fetchWithAuth(url, options = {}) {
  let token = getAccessToken();
  if (!token || isExpired(token)) token = await refreshIfNeeded();

  const tryOnce = async (tok) => {
    const headers = new Headers(options.headers || {});
    if (tok) headers.set('Authorization', `Bearer ${tok}`);
    return fetch(url, { ...options, headers });
  };

  let res = await tryOnce(token);
  if (res.status === 401) {
    token = await refreshIfNeeded();
    if (token) res = await tryOnce(token);
  }
  return res;
}
