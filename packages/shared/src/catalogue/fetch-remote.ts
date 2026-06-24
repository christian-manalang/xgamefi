import { safeFetch } from "../ssrf";
import { RemoteItemsSchema, type RemoteItem } from "../zod/catalogue";

export async function fetchRemoteItems(apiBaseUrl: string): Promise<RemoteItem[]> {
  const url = apiBaseUrl.replace(/\/+$/, "") + "/items";
  const res = await safeFetch(url, { maxBytes: 1_000_000, timeoutMs: 10_000 });
  if (!res.ok) {
    throw new Error(`catalogue fetch failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  return RemoteItemsSchema.parse(json);
}
