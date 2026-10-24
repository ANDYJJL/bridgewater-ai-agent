// Browser-safe API helpers.
// All calls use relative /api/backend/* paths (Next.js proxy routes).
// The Next.js server calls FastAPI server-side, so no CORS or port issues.

function devErr(label, err) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[backendApi/${label}]`, err);
  }
}

// Attempt to parse JSON without throwing if the body is empty or malformed.
async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Kept as a named export for reference; not used for browser fetch calls.
export function getBackendUrl() {
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
}

export async function checkHealth() {
  let res;
  try {
    res = await fetch('/api/backend/health');
  } catch (err) {
    devErr('health:network', err);
    const netErr = new Error('Backend API is not reachable.');
    netErr.type = 'network';
    throw netErr;
  }
  return safeJson(res);
}

export async function getLatestRecommendation({ refresh = 'auto' } = {}) {
  const query = refresh ? `?refresh=${encodeURIComponent(refresh)}` : '';
  let res;
  try {
    res = await fetch(`/api/backend/recommendation/latest${query}`);
  } catch (err) {
    devErr('latest:network', err);
    const netErr = new Error('Backend API is not reachable.');
    netErr.type = 'network';
    throw netErr;
  }
  const data = await safeJson(res);
  if (!res.ok) {
    devErr('latest:http', { status: res.status, data });
    const err = new Error((data && data.message) || `HTTP ${res.status}`);
    err.code = data && data.error;
    err.status = res.status;
    err.type = 'api';
    throw err;
  }
  return data;
}

export async function runRecommendation(payload) {
  const { ticker, company, theme, question } = payload;
  if (!ticker || !company) {
    const err = new Error('Please select NVDA or KO from the available backend packet companies.');
    err.type = 'validation';
    throw err;
  }

  devErr('run:request', { ticker, company, theme, question });

  let res;
  try {
    res = await fetch('/api/backend/recommendation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, company, theme, question }),
    });
  } catch (err) {
    devErr('run:network', err);
    const netErr = new Error('Backend API is not reachable.');
    netErr.type = 'network';
    throw netErr;
  }

  const data = await safeJson(res);

  if (!res.ok) {
    devErr('run:http', { status: res.status, data });
    const err = new Error((data && data.message) || `HTTP ${res.status}`);
    err.code = data && data.error;
    err.status = res.status;
    err.type = 'api';
    throw err;
  }

  if (!data) {
    const err = new Error('Backend returned an empty response.');
    err.type = 'parse';
    throw err;
  }

  return data;
}

export async function askAnalyst(payload) {
  let res;
  try {
    res = await fetch('/api/backend/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    devErr('chat:network', err);
    const netErr = new Error('Backend API is not reachable.');
    netErr.type = 'network';
    throw netErr;
  }

  const data = await safeJson(res);

  if (!res.ok) {
    devErr('chat:http', { status: res.status, data });
    const err = new Error((data && data.message) || `HTTP ${res.status}`);
    err.code = data && data.error;
    err.status = res.status;
    err.type = 'api';
    throw err;
  }

  return data;
}
