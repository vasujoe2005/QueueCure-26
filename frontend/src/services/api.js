const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

export function fetchQueue() {
  return request('/queue');
}

export function lookupPatient(phone) {
  return request(`/queue/patients/${phone}`);
}

export function createVisit(payload) {
  return request('/queue/visits', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function callNextVisit() {
  return request('/queue/call-next', { method: 'POST' });
}

export function completeVisit(visitId) {
  return request(`/queue/visits/${visitId}/complete`, { method: 'PATCH' });
}

export function cancelVisit(visitId) {
  return request(`/queue/visits/${visitId}/cancel`, { method: 'PATCH' });
}

export function trackVisit(query) {
  const params = new URLSearchParams(query);
  return request(`/queue/track?${params.toString()}`);
}

export function fetchAnalytics() {
  return request('/analytics/wait-time');
}
