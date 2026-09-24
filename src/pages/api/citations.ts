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
  type CitationCache = { citationCount: number; source: string; year?: number; cachedAt: string };
  let staleData: CitationCache | null = null;
  if (cache) {
    const cachedData = await cache.get<CitationCache>(cacheKey);
    
    if (cachedData) {
      return Response.json({
        citationCount: cachedData.citationCount,
        source: cachedData.source,
        year: cachedData.year,
        cached: true,
      });
    }
    staleData = await cache.getStale<CitationCache>(cacheKey);
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
        return new Response(
          JSON.stringify({ 
            citationCount: null,
            message: "Paper not found in citation database"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
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
    
    if (staleData) {
      return Response.json({
        citationCount: staleData.citationCount,
        source: staleData.source,
        year: staleData.year,
        cached: true,
        stale: true,
      });
    }
    return new Response(
      JSON.stringify({ 
        citationCount: null,
        error: "Failed to fetch citations and no cache available"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};
