import type {
  AnimalRecord,
  BookingRecord,
  InvoiceRecord,
  Profile,
  ProfileUpdate,
  QuoteRecord,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'pawfect-portal-token';

// The portal JWT (12h, see PORTAL_WEB_TOKEN_TTL in the backend). Kept in
// sessionStorage so closing the browser signs the customer out.
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the session just won't survive a refresh.
  }
}

// App.tsx registers this so any 401 (expired session, or staff switched the
// customer's portal access off) drops back to the sign-in screen.
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function send(path: string, options: RequestInit = {}, auth = true): Promise<Response> {
  const token = auth ? getToken() : null;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401 && auth) onUnauthorized();
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    if (res.status === 429) throw new Error('Too many attempts. Please wait a minute and try again.');
    throw new Error(message || `Request failed (${res.status})`);
  }
  return res;
}

async function request<T>(path: string, options?: RequestInit, auth = true): Promise<T> {
  const res = await send(path, options, auth);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// --- sign-in (no token yet) ---

export function requestCode(email: string): Promise<{ ok: true }> {
  return request('/portal/web/request-code', { method: 'POST', body: JSON.stringify({ email }) }, false);
}

export function verifyCode(email: string, code: string): Promise<{ stepToken: string }> {
  return request(
    '/portal/web/verify-code',
    { method: 'POST', body: JSON.stringify({ email, code }) },
    false,
  );
}

export function verifyPhone(
  email: string,
  stepToken: string,
  digits: string,
): Promise<{ token: string }> {
  return request(
    '/portal/web/verify-phone',
    { method: 'POST', body: JSON.stringify({ email, stepToken, digits }) },
    false,
  );
}

// --- signed in ---

export const fetchProfile = () => request<Profile>('/portal/me');

export const updateProfile = (dto: ProfileUpdate) =>
  request<Profile>('/portal/me', { method: 'PATCH', body: JSON.stringify(dto) });

export const fetchInvoices = () => request<InvoiceRecord[]>('/portal/invoices');
export const fetchQuotes = () => request<QuoteRecord[]>('/portal/quotes');
export const fetchAnimals = () => request<AnimalRecord[]>('/portal/animals');
export const fetchBookings = () => request<BookingRecord[]>('/portal/bookings');

// Fetches the PDF with the bearer token (a plain link can't send it) and
// hands it to the browser as a download.
export async function downloadPdf(kind: 'invoices' | 'quotes', id: string, filename: string) {
  const res = await send(`/portal/${kind}/${id}/pdf`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
