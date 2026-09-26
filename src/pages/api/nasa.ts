import type { APIRoute } from 'astro';
import { createCache } from '../../utils/cache';
import { normalizeApod, type ApodCard } from '../../utils/nasa';

const CACHE_KEY = 'nasa:apod:latest:v2';
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const NASA_URL = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic/?per_page=1';

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600' },
  });
}

export const GET: APIRoute = async ({ locals }) => {
  const runtime = locals.runtime as { env: { DB?: D1Database } } | undefined;
  const cache = createCache(runtime?.env.DB);
  const cached = await cache?.get<ApodCard>(CACHE_KEY);
  if (cached) return json(cached);

  try {
    const response = await fetch(NASA_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`NASA APOD returned ${response.status}`);
    const data = normalizeApod(await response.json());
    await cache?.set(CACHE_KEY, data, CACHE_TTL_SECONDS);
    return json(data);
  } catch (error) {
    console.error('NASA APOD request failed:', error);
    const stale = await cache?.getStale<ApodCard>(CACHE_KEY);
    if (stale) return json(stale);
    return json({ error: 'NASA image unavailable' }, 502);
  }
};
