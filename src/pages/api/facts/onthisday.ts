import type { APIRoute } from "astro";
import { getRandomFallbackObject, fallbackOnThisDayFacts } from "../../../utils/facts/fallbacks";
import { createCache } from "../../../utils/cache";

export const GET: APIRoute = async ({ request, locals }) => {
  // Create cache instance
  const runtime = locals.runtime as { env: { DB?: D1Database } };
  const cache = createCache(runtime.env.DB);
  
  try {
    // Get language and random date parameters
    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || 'en';
    const random = url.searchParams.get('random') === 'true';
    
    // Check if this is a "New Fact" request (bypass cache)
    const skipCache = url.searchParams.get('nocache') === 'true';

    // Get date (today or random)
    let month: number;
    let day: number;

    if (random) {
      // Random date
      month = Math.floor(Math.random() * 12) + 1;
      day = Math.floor(Math.random() * 28) + 1;
    } else {
      // Today's date
      const today = new Date();
      month = today.getMonth() + 1;
      day = today.getDate();
    }

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
    
    // Create cache key - for random, use a fixed key so all random requests share cooldown
    // This prevents spamming "New Fact" button
    const cacheKey = random 
      ? `facts:otd:random:${lang}`
      : `facts:otd:${monthStr}:${dayStr}:${lang}:today`;
    
    // Check cache (only if not skipping cache)
    if (!skipCache && cache) {
      const cached = await cache.get<{ fact: string; date: string; source: string; sourceUrl: string; needsTranslation: boolean }>(cacheKey);
      if (cached) {
        console.log(`Serving cached OTD fact for ${monthStr}/${dayStr}`);
        return new Response(JSON.stringify(cached), {
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

    // Pick a random event from this day
    const event = data.events[Math.floor(Math.random() * data.events.length)];

    // Build Wikipedia link (e.g., March_9)
    const dateTitle = `${monthName}_${day}`;
    const wikiUrl = `https://${apiLang}.wikipedia.org/wiki/${dateTitle}`;

    const result = {
      fact: event.text,
      date: `${dayStr}/${monthStr}`,
      source: `wikipedia.org (${apiLang})`,
      sourceUrl: wikiUrl,
      needsTranslation: isGreek,
    };
    
    // Cache the result for 90 seconds (only if not skipping cache)
    if (!skipCache && cache) {
      await cache.set(cacheKey, result, 90);
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
