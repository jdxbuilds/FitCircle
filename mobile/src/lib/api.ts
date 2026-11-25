import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Set EXPO_PUBLIC_API_URL to your API (e.g. https://api.fitcircle.co). On a phone, localhost means the phone itself. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// ---------- session token (Keychain / Keystore on phones, browser storage on the web preview) ----------
const KEY = 'fitcircle_session';
export const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; }
    }
    return SecureStore.getItemAsync(KEY);
  },
  async set(value: string) {
    if (Platform.OS === 'web') {
      try { globalThis.localStorage?.setItem(KEY, value); } catch { /* private mode: session lasts until reload */ }
      return;
    }
    await SecureStore.setItemAsync(KEY, value);
  },
  async clear() {
    if (Platform.OS === 'web') {
      try { globalThis.localStorage?.removeItem(KEY); } catch { /* ignore */ }
      return;
    }
    await SecureStore.deleteItemAsync(KEY);
  },
};

let token: string | null = null;
let onExpired: (() => void) | null = null;
export const setApiToken = (t: string | null) => { token = t; };
export const onSessionExpired = (fn: () => void) => { onExpired = fn; };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = opts;
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline', "Can't reach FitCircle. Check your connection and try again.");
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    if (res.status === 401 && token) onExpired?.();
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Something went wrong. Try again.');
  }
  return data as T;
}

export interface UploadTicket { url: string; fields: Record<string, string>; key: string }
export interface PickedFile { uri: string; mimeType: string; name: string }

/** Sends a file with an upload ticket from the API (an S3 presigned form, or the local dev stand-in). */
export async function uploadFile(ticket: UploadTicket, file: PickedFile) {
  const form = new FormData();
  for (const [k, v] of Object.entries(ticket.fields)) form.append(k, v);
  if (Platform.OS === 'web') {
    const blob = await (await fetch(file.uri)).blob();
    form.append('file', blob, file.name);
  } else {
    // React Native's FormData takes a { uri, name, type } object for files
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
  let res: Response;
  try {
    res = await fetch(ticket.url, { method: 'POST', body: form });
  } catch {
    throw new ApiError(0, 'offline', 'Upload failed. Check your connection and try again.');
  }
  if (!res.ok) throw new ApiError(res.status, 'upload_failed', 'Upload failed. Try again.');
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
