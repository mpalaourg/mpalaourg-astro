import type { APIRoute } from "astro";
import { getRandomFallback, fallbackGeneralFacts } from "../../../utils/facts/fallbacks";
import { createCache } from "../../../utils/cache";

export const GET: APIRoute = async ({ url, locals }) => {
  // Check if this is a "New Fact" request (bypass cache)
  const skipCache = url.searchParams.get('nocache') === 'true';
  
  // Create cache instance
  const runtime = locals.runtime as { env: { DB?: D1Database } };
  const cache = createCache(runtime.env.DB);
  
  try {
    // Check cache first (only if not skipping cache)
    if (!skipCache && cache) {
      const cached = await cache.get<{ fact: string; source: string; sourceUrl: string; needsTranslation: boolean }>('facts:general');
      if (cached) {
        console.log('Serving cached general fact');
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    
    // Fetch from Useless Facts API
    const res = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
    
    if (!res.ok) {
      throw new Error(`Useless Facts API returned ${res.status}`);
    }
    
    const data = await res.json() as { text: string; source_url?: string };
    
    const result = {
      fact: data.text,
      source: data.source_url || 'uselessfacts.jsph.pl',
      sourceUrl: data.source_url || 'https://uselessfacts.jsph.pl',
      needsTranslation: true,
    };
    
    // Cache the result for 90 seconds (only if not skipping cache)
    if (!skipCache && cache) {
      await cache.set('facts:general', result, 90);
    }
    
    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error('General facts API error:', error);
    
    return new Response(
      JSON.stringify({
        fact: getRandomFallback(fallbackGeneralFacts),
        source: 'fallback',
        sourceUrl: '',
        needsTranslation: true,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
