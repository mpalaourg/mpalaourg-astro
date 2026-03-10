import type { APIRoute } from "astro";
import { createCache } from "../../utils/cache";

// Semantic Scholar API - Free academic API with citation counts
// https://api.semanticscholar.org/api-docs/

interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  citationCount?: number;
  influentialCitationCount?: number;
  referenceCount?: number;
  year?: number;
  authors?: Array<{ name: string }>;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const doi = url.searchParams.get("doi");
  
  if (!doi) {
    return new Response(
      JSON.stringify({ error: "DOI parameter required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  
  // Create cache instance (24 hours = 86400 seconds)
  const runtime = locals.runtime as { env: { DB?: D1Database } };
  const cache = createCache(runtime.env.DB);
  const cacheKey = `citations:${doi}`;
  
  // Check cache first
  let cachedData = null;
  if (cache) {
    cachedData = await cache.get<{ 
      citationCount: number; 
      source: string;
      cachedAt: string;
    }>(cacheKey);
    
    if (cachedData) {
      console.log(`Serving cached citations for DOI: ${doi} (count: ${cachedData.citationCount})`);
    }
  }
  
  try {
    // Query Semantic Scholar by DOI
    const apiUrl = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=citationCount,influentialCitationCount,referenceCount,year`;
    
    const res = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!res.ok) {
      if (res.status === 404) {
        // Paper not found in Semantic Scholar
        console.log(`Paper not found in Semantic Scholar for DOI: ${doi}`);
        // Return cached data if available (even if expired)
        if (cachedData) {
          return new Response(JSON.stringify({
            citationCount: cachedData.citationCount,
            source: `${cachedData.source} (cached)`,
            cached: true,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response(
          JSON.stringify({ 
            citationCount: null,
            message: "Paper not found in citation database"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (res.status === 429) {
        // Rate limited - return cached data
        console.log(`Rate limited for DOI: ${doi}`);
        if (cachedData) {
          return new Response(JSON.stringify({
            citationCount: cachedData.citationCount,
            source: `${cachedData.source} (cached)`,
            cached: true,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      throw new Error(`Semantic Scholar API error: ${res.status}`);
    }
    
    const data = await res.json() as SemanticScholarPaper;
    const citationCount = data.citationCount || 0;
    
    const result = {
      citationCount: citationCount,
      source: 'Semantic Scholar',
      year: data.year,
    };
    
    // Cache the result for 24 hours
    if (cache) {
      await cache.set(cacheKey, {
        ...result,
        cachedAt: new Date().toISOString(),
      }, 86400);
    }
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("Citation fetch error:", error);
    
    // API failed - return cached data if available (stale cache)
    if (cachedData) {
      console.log(`API failed, serving stale cache for DOI: ${doi}`);
      return new Response(JSON.stringify({
        citationCount: cachedData.citationCount,
        source: `${cachedData.source} (cached)`,
        cached: true,
        error: "Failed to fetch fresh data, showing cached value",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    
    // No cache available
    return new Response(
      JSON.stringify({ 
        citationCount: null,
        error: "Failed to fetch citations and no cache available"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};
