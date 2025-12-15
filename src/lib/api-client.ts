import { ApiResponse } from "../../shared/types";
import { useAuthStore } from "@/store/auth-store";
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init?.headers,
  };
  const res = await fetch(path, { ...init, headers });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success || json.data === undefined) {
    throw new Error(json.error || `Request failed with status ${res.status}`);
  }
  return json.data;
}