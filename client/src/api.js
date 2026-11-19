const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'netdesign_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function req(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { ...opts, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) {
      setToken(null);
      window.dispatchEvent(new Event('auth:logout'));
    }
    throw new Error(data.error || res.statusText);
  }
  return data;
}

export const api = {
  signup: (body) => req('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  login: (body) => req('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  me: () => req('/api/auth/me'),
  create: (input) => req('/api/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  list: () => req('/api/designs'),
  get: (id) => req(`/api/designs/${id}`),
  remove: (id) => req(`/api/designs/${id}`, { method: 'DELETE' }),
  pools: () => req('/api/ipam'),
  async downloadPdf(id, filename) {
    const token = getToken();
    const res = await fetch(`${BASE}/api/designs/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('PDF download failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'design.pdf';
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
