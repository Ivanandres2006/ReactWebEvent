// src/lib/auth.js
export function saveTokens({ accessToken, token, refreshToken }) {
    // backend returns either {token, refreshToken} or {accessToken, refreshToken}
    const t = token || accessToken;
    if (t) localStorage.setItem('token', t);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  }
  export function getAccessToken() {
    return localStorage.getItem('token') || '';
  }
  export function getRefreshToken() {
    return localStorage.getItem('refreshToken') || '';
  }
  export function clearTokens() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  }
  