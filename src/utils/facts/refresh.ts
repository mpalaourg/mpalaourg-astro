// Reserve one upstream refresh per category across all workers. A rejected
// refresh uses a local fallback fact without calling the upstream service.
export async function claimFactRefresh(
  db: D1Database | undefined,
  category: 'general' | 'sports',
): Promise<boolean> {
  if (!db) return false;

  const now = Date.now();
  try {
    const result = await db.prepare(`
      INSERT INTO cache (key, data, expires_at) VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at
      WHERE cache.expires_at <= ?
    `).bind(`facts:refresh:${category}`, now + 15_000, now).run();
    return (result.meta?.changes ?? 0) > 0;
  } catch (error) {
    console.error('Fact refresh cooldown error:', error);
    return false;
  }
}
