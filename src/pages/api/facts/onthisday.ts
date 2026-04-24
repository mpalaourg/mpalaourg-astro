import type { APIRoute } from "astro";
import { getRandomFallbackObject, fallbackOnThisDayFacts } from "../../../utils/facts/fallbacks";
import { createCache } from "../../../utils/cache";

export const GET: APIRoute = async ({ request, locals }) => {
  // Create cache instance
  const runtime = locals.runtime as { env: { DB?: D1Database } };
  const cache = createCache(runtime.env.DB);
  
  try {
    // Get language parameter
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || 'en';
    
    // Check if this is a "New Fact" request (bypass cache to get fresh events)
    const skipCache = url.searchParams.get('nocache') === 'true';

    // Always use today's date
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Month names for Wikipedia URLs
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const monthName = monthNames[month - 1];

    // Wikipedia API supports: ar, de, en, es, fi, fr, he, it, ja, ko, nl, no, pl, pt, ro, ru, sv, uk, vi, zh
    // Greek (el) is NOT supported, so we'll fetch English and translate if needed
    const supportedLangs = ['ar', 'de', 'en', 'es', 'fi', 'fr', 'he', 'it', 'ja', 'ko', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sv', 'uk', 'vi', 'zh'];
    const isGreek = lang === 'el';
    const apiLang = supportedLangs.includes(lang) ? lang : 'en';
    
    // Create cache key - cache the events list for today
    const cacheKey = `facts:otd:${monthStr}:${dayStr}:${apiLang}`;
    
    // Check cache (only if not skipping cache)
    if (!skipCache && cache) {
      const cached = await cache.get<{ events: Array<{ text: string }>; date: string; source: string; sourceUrl: string }>(cacheKey);
      if (cached && cached.events && cached.events.length > 0) {
        // Return a random event from cached list
        const randomEvent = cached.events[Math.floor(Math.random() * cached.events.length)];
        return new Response(JSON.stringify({
          fact: randomEvent.text,
          date: cached.date,
          source: cached.source,
          sourceUrl: cached.sourceUrl,
          needsTranslation: isGreek,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Fetch from Wikipedia On This Day API
    const apiUrl = `https://api.wikimedia.org/feed/v1/wikipedia/${apiLang}/onthisday/events/${monthStr}/${dayStr}`;
    
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'mpalaourg-astro/1.0 (personal website)',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Wikipedia API returned ${res.status}`);
    }

    const data = await res.json() as {
      events?: Array<{ text: string; pages?: Array<{ titles?: { normalized?: string } }> }>
    };

    if (!data.events || data.events.length === 0) {
      throw new Error('No events found for this date');
    }

    // Build Wikipedia link (e.g., March_9)
    const dateTitle = `${monthName}_${day}`;
    const wikiUrl = `https://${apiLang}.wikipedia.org/wiki/${dateTitle}`;

    const result = {
      fact: data.events[0].text, // First event as default
      date: `${dayStr}/${monthStr}`,
      source: `wikipedia.org (${apiLang})`,
      sourceUrl: wikiUrl,
      needsTranslation: isGreek,
    };
    
    // Cache the events list for 6 hours (21600 seconds)
    if (cache) {
      await cache.set(cacheKey, {
        events: data.events,
        date: `${dayStr}/${monthStr}`,
        source: `wikipedia.org (${apiLang})`,
        sourceUrl: wikiUrl,
      }, 21600);
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
    console.error('On This Day API error:', error);

    const fallback = getRandomFallbackObject(fallbackOnThisDayFacts);

    return new Response(
      JSON.stringify({
        ...fallback,
        needsTranslation: false,
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
