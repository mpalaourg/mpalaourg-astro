import type { APIRoute } from "astro";

// Last.fm API Integration
// Requires API key: https://www.last.fm/api
// Store LASTFM_API_KEY in environment variables

interface LastFmTrack {
  name: string;
  artist: { "#text": string };
  album: { "#text": string };
  image?: Array<{ "#text": string; size: string }>;
  "@attr"?: { nowplaying?: string };
  url: string;
  date?: { uts: string };
}

interface LastFmRecentTracks {
  recenttracks?: {
    track?: LastFmTrack[];
    "@attr"?: {
      user: string;
      totalPages: string;
      page: string;
      perPage: string;
      total: string;
    };
  };
}

interface LastFmUserInfo {
  user?: {
    name: string;
    playcount?: string;
    image?: Array<{ "#text": string; size: string }>;
  };
}

function formatTimeAgo(uts: string | undefined): string {
  if (!uts) return '';
  const date = new Date(parseInt(uts) * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const username = url.searchParams.get("username") || "mpalaurg";
  
  // Get API key from environment
  const runtime = locals.runtime as { env: { LASTFM_API_KEY?: string } };
  const apiKey = runtime.env.LASTFM_API_KEY;
  
  if (!apiKey) {
    // Return dummy data if no API key configured
    return new Response(
      JSON.stringify({
        tracks: [{
          track: "No API Key",
          artist: "Configure LASTFM_API_KEY",
          album: "",
          cover: null,
          isPlaying: false,
          timeAgo: "",
        }],
        scrobbles: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  
  try {
    // Fetch recent tracks (last 8)
    const res = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${apiKey}&format=json&limit=8`
    );
    
    if (!res.ok) throw new Error(`Last.fm API error: ${res.status}`);
    
    const data = await res.json() as LastFmRecentTracks;
    const tracks = data.recenttracks?.track || [];
    
    if (!tracks.length) {
      return new Response(
        JSON.stringify({ tracks: [], scrobbles: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Format tracks
    const formattedTracks = tracks.map((track) => {
      const isPlaying = track["@attr"]?.nowplaying === "true";
      const cover = track.image?.find(img => img.size === "medium")?.["#text"] || 
                    track.image?.[2]?.["#text"] || 
                    null;
      
      return {
        track: track.name,
        artist: track.artist["#text"],
        album: track.album["#text"],
        cover: cover,
        isPlaying,
        timeAgo: isPlaying ? '' : formatTimeAgo(track.date?.uts),
      };
    });
    
    // Fetch user info for scrobbles count
    let scrobbles = 0;
    try {
      const userRes = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${apiKey}&format=json`
      );
      
      if (userRes.ok) {
        const userData = await userRes.json() as LastFmUserInfo;
        scrobbles = parseInt(userData.user?.playcount || "0");
      }
    } catch (e) {
      // Ignore user info fetch errors
    }
    
    return new Response(JSON.stringify({
      tracks: formattedTracks,
      scrobbles,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30", // Cache for 30 seconds
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: "Failed to fetch music data",
        tracks: []
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
