import type { APIRoute } from "astro";

// DeepL API Translation Endpoint
// Requires DEEPL_API_KEY in environment variables

interface DeepLResponse {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const text = url.searchParams.get("text");
  const targetLang = url.searchParams.get("target") || "el";
  
  if (!text) {
    return new Response(
      JSON.stringify({ error: "Text parameter required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  
  // Get API key from environment
  const runtime = locals.runtime as { env: { DEEPL_API_KEY?: string } };
  const apiKey = runtime.env.DEEPL_API_KEY;
  
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "DEEPL_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  
  try {
    // DeepL API endpoint
    const deeplUrl = "https://api-free.deepl.com/v2/translate";
    
    const res = await fetch(deeplUrl, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
        target_lang: targetLang.toUpperCase(),
        source_lang: "EN",
      }),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error("DeepL API error:", res.status, errorText);
      return new Response(
        JSON.stringify({ error: "Translation failed", fallback: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const data = await res.json() as DeepLResponse;
    
    if (data.translations && data.translations.length > 0) {
      return new Response(
        JSON.stringify({
          text: data.translations[0].text,
          sourceLang: data.translations[0].detected_source_language,
          success: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: "No translation returned", fallback: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
  } catch (error) {
    console.error("Translation API error:", error);
    return new Response(
      JSON.stringify({ error: "Translation service error", fallback: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};
