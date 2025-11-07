// src/lib/authClient.js
export const API = 'https://backendevent-etce.onrender.com';

// ---------- storage helpers ----------
export function normalizeToken(t) {
  if (!t) return '';
  return t.startsWith('Bearer ') ? t.slice(7) : t;
}
export function getAccessToken() {
  return normalizeToken(localStorage.getItem('token') || '');
}
export function getRefreshToken() {
  const rt = localStorage.getItem('refreshToken') || '';
  // guard against strings like "null" / "undefined"
  if (!rt || rt === 'null' || rt === 'undefined') return '';
  return rt;
}
export function saveTokens({ accessToken, token, refreshToken }) {
  const t = normalizeToken(token || accessToken || '');
  if (t) localStorage.setItem('token', t);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  window.dispatchEvent(new Event('auth:login'));
}
export function clearTokens() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  window.dispatchEvent(new Event('auth:logout'));
}

// ---------- jwt exp ----------
function isExpired(jwt) {
  try {
    const [, b] = jwt.split('.');
    if (!b) return false;
    const payload = JSON.parse(atob(b.replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.exp ? Date.now() >= payload.exp * 1000 : false;
  } catch {
    return false;
  }
}

// ---------- refresh flow (hardened) ----------
export async function refreshIfNeeded() {
  const rt = getRefreshToken();
  if (!rt) return null;                 // not logged in → do nothing

  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Header isn’t required by your API, but harmless if present:
      'Authorization': `Bearer ${rt}`,
    },
    body: JSON.stringify({ refreshToken: rt }),
  });

  if (!res.ok) {
    // refresh token is bad/stale → drop both tokens so UI shows login
    clearTokens();
    return null;
  }

  const j = await res.json();
  saveTokens({ accessToken: j.accessToken || j.token, refreshToken: j.refreshToken });
  return getAccessToken();
}

// Optional alias (some files call this)
export async function refreshTokens() { return refreshIfNeeded(); }

// ---------- always use this for protected calls ----------
export async function fetchWithAuth(url, options = {}) {
  let token = getAccessToken();

  // If we have a token but it’s expired, try a one-time refresh
  if (token && isExpired(token)) token = await refreshIfNeeded();

  // If we never had a token at all, do NOT try to refresh blindly
  if (!token && !getRefreshToken()) {
    // anonymous request – just send it without Authorization
    return fetch(url, { ...options });
  }

  const tryOnce = async (tok) => {
    const headers = new Headers(options.headers || {});
    if (tok) headers.set('Authorization', `Bearer ${tok}`);
    return fetch(url, { ...options, headers });
  };

  let res = await tryOnce(token);

  // One retry on 401: attempt refresh, then re-call; if still 401, clear & return
  if (res.status === 401 && !String(url).endsWith('/auth/refresh')) {
    const newTok = await refreshIfNeeded();
    if (newTok) {
      res = await tryOnce(newTok);
    } else {
      // refresh failed → ensure clean state
      clearTokens();
    }
  }

  return res;
}
