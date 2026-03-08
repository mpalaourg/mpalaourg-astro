import type { APIRoute } from "astro";
import { getRandomQuote, type F1Quote } from "../../utils/f1/quotes";

export const GET: APIRoute = async () => {
  try {
    const quote = getRandomQuote();
    
    return new Response(JSON.stringify(quote), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60", // Cache for 1 minute
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: "Failed to fetch quote",
        quote: "Leave me alone, I know what I'm doing.",
        author: "Kimi Räikkönen"
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
