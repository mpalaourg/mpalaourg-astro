import type { APIRoute } from "astro";
import { createCache } from "../../utils/cache";

interface DeepLResponse {
  translations: Array<{ detected_source_language: string; text: string }>;
}

const MAX_TEXT_LENGTH = 400;
const DAILY_CHARACTER_BUDGET = 12_000;
const REQUESTS_PER_MINUTE = 12;
const TRANSLATION_TTL = 30 * 24 * 60 * 60;

const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeBudget(db: D1Database, key: string, windowStart: number, amount: number, maximum: number) {
  const result = await db.prepare(`
    INSERT INTO translation_limits (key, window_start, used) VALUES (?, ?, ?)
    ON CONFLICT(key, window_start) DO UPDATE SET used = used + excluded.used
    WHERE used + excluded.used <= ?
  `).bind(key, windowStart, amount, maximum).run();
  return result.meta.changes === 1;
}

export const GET: APIRoute = async ({ request, url, locals }) => {
  const text = url.searchParams.get("text");
  const target = url.searchParams.get("target") || "el";
  if (!text || text.length > MAX_TEXT_LENGTH || target !== "el") {
    return json({ error: "Invalid text or target language", fallback: true }, 400);
  }

  const runtime = locals.runtime as { env: { DB?: D1Database; DEEPL_API_KEY?: string } };
  const { DB: db, DEEPL_API_KEY: apiKey } = runtime.env;
  if (!apiKey || !db) {
    return json({ error: "Translation service unavailable", fallback: true }, 503);
  }

  try {
    const cache = createCache(db);
    const cacheKey = `translation:en:el:${await sha256(text)}`;
    const cached = await cache?.get<{ text: string; sourceLang: string; success: true }>(cacheKey);
    if (cached) return json(cached);

    const now = Date.now();
    const minute = Math.floor(now / 60_000) * 60_000;
    const day = Math.floor(now / 86_400_000) * 86_400_000;
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const visitorKey = `ip:${await sha256(ip)}`;

    if (!await consumeBudget(db, visitorKey, minute, 1, REQUESTS_PER_MINUTE) ||
        !await consumeBudget(db, "global", day, text.length, DAILY_CHARACTER_BUDGET)) {
      return json({ error: "Translation limit reached", fallback: true }, 429);
    }

    const res = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: [text], target_lang: "EL", source_lang: "EN" }),
    });
    if (!res.ok) {
      console.error("DeepL API error:", res.status);
      return json({ error: "Translation failed", fallback: true }, 502);
    }

    const data = await res.json() as DeepLResponse;
    const translation = data.translations?.[0];
    if (!translation?.text) return json({ error: "No translation returned", fallback: true }, 502);

    const result = { text: translation.text, sourceLang: translation.detected_source_language, success: true as const };
    await cache?.set(cacheKey, result, TRANSLATION_TTL);
    return json(result);
  } catch (error) {
    console.error("Translation API error:", error);
    return json({ error: "Translation service unavailable", fallback: true }, 503);
  }
};
