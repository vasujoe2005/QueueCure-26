const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export function fetchQueue() {
  return request('/queue');
}

export function addPatient(patientName) {
  return request('/queue/patients', {
    method: 'POST',
    body: JSON.stringify({ patientName }),
  });
}

export function callNextPatient() {
  return request('/queue/call-next', { method: 'POST' });
}

export function completePatient(patientId) {
  return request(`/queue/patients/${patientId}/complete`, { method: 'PATCH' });
}

export function fetchAnalytics() {
  return request('/analytics/wait-time');
}
