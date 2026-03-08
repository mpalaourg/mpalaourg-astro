import type { APIRoute } from "astro";

// Last.fm API Integration
// Requires API key: https://www.last.fm/api
// Store LASTFM_API_KEY in environment variables

export const GET: APIRoute = async ({ url, locals }) => {
  const username = url.searchParams.get("username") || "mpalaourg";
  
  // Get API key from environment
  const runtime = locals.runtime as { env: { LASTFM_API_KEY?: string } };
  const apiKey = runtime.env.LASTFM_API_KEY;
  
  if (!apiKey) {
    // Return dummy data if no API key configured
    return new Response(
      JSON.stringify({
        track: "No API Key",
        artist: "Configure LASTFM_API_KEY",
        cover: null,
        isPlaying: false,
        scrobbles: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  
  try {
    // Fetch currently playing / recent tracks
    const res = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${apiKey}&format=json&limit=1`
    );
    
    if (!res.ok) throw new Error(`Last.fm API error: ${res.status}`);
    
    interface LastFmRecentTracks {
      recenttracks?: {
        track?: Array<{
          name: string;
          artist: { "#text": string };
          album: { "#text": string };
          image?: Array<{ "#text": string }>;
          "@attr"?: { nowplaying?: string };
          url: string;
        }>;
      };
    }
    
    const data = await res.json() as LastFmRecentTracks;
    const track = data.recenttracks?.track?.[0];
    
    if (!track) {
      return new Response(
        JSON.stringify({ track: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const isPlaying = track["@attr"]?.nowplaying === "true";
    
    // Fetch user info for scrobbles count
    const userRes = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${apiKey}&format=json`
    );
    
    let scrobbles = 0;
    if (userRes.ok) {
      interface LastFmUserInfo {
        user?: {
          playcount?: string;
        };
      }
      const userData = await userRes.json() as LastFmUserInfo;
      scrobbles = parseInt(userData.user?.playcount || "0");
    }
    
    const response = {
      track: track.name,
      artist: track.artist["#text"],
      album: track.album["#text"],
      cover: track.image?.[2]?.["#text"] || null,
      isPlaying,
      scrobbles,
      url: track.url,
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30", // Cache for 30 seconds
      },
    });
  } catch (error) {
    console.error("Music API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch music data" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
