type EdgeCache = {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
};

export type EdgeCacheRuntime = {
  caches?: { default: EdgeCache };
  ctx?: { waitUntil(promise: Promise<unknown>): void };
};

/** Cache only successful public F1 responses. Local previews can run without Cache API support. */
export async function getEdgeResponse(runtime: EdgeCacheRuntime, url: URL): Promise<Response | null> {
  try {
    return await runtime.caches?.default.match(url.href) ?? null;
  } catch {
    return null;
  }
}

export function putEdgeResponse(runtime: EdgeCacheRuntime, url: URL, response: Response): void {
  if (!runtime.caches?.default || response.status !== 200) return;
  try {
    const write = runtime.caches.default.put(url.href, response.clone()).catch((error) => {
      console.error("F1 edge cache write failed:", error);
    });
    runtime.ctx?.waitUntil(write);
  } catch (error) {
    console.error("F1 edge cache write failed:", error);
  }
}
