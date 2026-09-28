const BASE = import.meta.env.VITE_API_URL || '';

async function req(url, opts) {
  const res = await fetch(BASE + url, opts);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  create: (input) => req('/api/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  list: () => req('/api/designs'),
  get: (id) => req(`/api/designs/${id}`),
  remove: (id) => req(`/api/designs/${id}`, { method: 'DELETE' }),
  pools: () => req('/api/ipam'),
  pdfUrl: (id) => `${BASE}/api/designs/${id}/pdf`,
};
