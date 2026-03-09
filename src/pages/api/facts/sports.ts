import type { APIRoute } from "astro";
import { getRandomFallbackObject, fallbackSportsQuestions } from "../../../utils/facts/fallbacks";
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
      const cached = await cache.get<{ question: string; answer: string; source: string; sourceUrl: string; needsTranslation: boolean }>('facts:sports');
      if (cached) {
        console.log('Serving cached sports fact');
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    
    // Fetch from The Trivia API - Sports category
    const res = await fetch(
      'https://the-trivia-api.com/v2/questions?categories=sport_and_leisure&limit=1&difficulties=easy,medium'
    );
    
    if (!res.ok) {
      throw new Error(`Trivia API returned ${res.status}`);
    }
    
    const data = await res.json() as Array<{
      question: { text: string };
      correctAnswer: string;
    }>;
    
    if (!data || data.length === 0) {
      throw new Error('No questions returned');
    }
    
    const q = data[0];
    
    const result = {
      question: q.question.text,
      answer: q.correctAnswer,
      source: 'the-trivia-api.com',
      sourceUrl: 'https://the-trivia-api.com',
      needsTranslation: true,
    };
    
    // Cache the result for 90 seconds (only if not skipping cache)
    if (!skipCache && cache) {
      await cache.set('facts:sports', result, 90);
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
    console.error('Sports facts API error:', error);
    
    const randomQ = getRandomFallbackObject(fallbackSportsQuestions);
    
    return new Response(
      JSON.stringify({
        question: randomQ.question,
        answer: randomQ.answer,
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
