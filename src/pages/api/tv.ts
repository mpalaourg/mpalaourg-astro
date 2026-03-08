import type { APIRoute } from "astro";

// Trakt.tv API Integration
// Requires API key: https://trakt.docs.apiary.io/
// Store TRAKT_CLIENT_ID in environment variables

export const GET: APIRoute = async ({ url, locals }) => {
  const username = url.searchParams.get("username") || "mpalaourg";
  
  // Get API key from environment
  const runtime = locals.runtime as { env: { TRAKT_CLIENT_ID?: string } };
  const clientId = runtime.env.TRAKT_CLIENT_ID;
  
  if (!clientId) {
    // Return dummy data if no API key configured
    return new Response(
      JSON.stringify({
        title: "No API Key",
        type: "show",
        episode: null,
        poster: null,
        rating: null,
        isWatching: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  
  try {
    // Fetch last watched item
    const res = await fetch(
      `https://api.trakt.tv/users/${username}/history?limit=1`,
      {
        headers: {
          "Content-Type": "application/json",
          "trakt-api-version": "2",
          "trakt-api-key": clientId,
        },
      }
    );
    
    if (!res.ok) throw new Error(`Trakt API error: ${res.status}`);
    
    interface TraktHistoryItem {
      type: "movie" | "episode";
      movie?: {
        title: string;
        year: number;
        ids: {
          tmdb?: number;
        };
      };
      show?: {
        title: string;
      };
      episode?: {
        season: number;
        number: number;
        title: string;
      };
      watched_at: string;
    }
    
    const data = await res.json() as TraktHistoryItem[];
    const item = data?.[0];
    
    if (!item) {
      return new Response(
        JSON.stringify({ title: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const isWatching = new Date().getTime() - new Date(item.watched_at).getTime() < 3600000; // Within last hour
    
    let title: string;
    let episode: string | null = null;
    let posterUrl: string | null = null;
    
    if (item.type === "movie" && item.movie) {
      title = `${item.movie.title} (${item.movie.year})`;
      if (item.movie.ids.tmdb) {
        posterUrl = `https://image.tmdb.org/t/p/w92${item.movie.ids.tmdb}`; // Will need proper TMDB integration
      }
    } else if (item.type === "episode" && item.show && item.episode) {
      title = item.show.title;
      episode = `S${item.episode.season}E${item.episode.number}`;
    } else {
      title = "Unknown";
    }
    
    const response = {
      title,
      type: item.type,
      episode,
      poster: posterUrl,
      rating: null, // Would need separate API call
      isWatching,
      watchedAt: item.watched_at,
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error("TV API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch TV data" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
