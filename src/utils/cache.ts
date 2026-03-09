// Database caching utility for storing computed/cached data
// Uses Cloudflare D1 SQLite database

export interface CacheEntry {
  key: string;
  data: string;
  expires_at: number;
}

export class Cache {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Get cached data by key
   * Returns null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.db
        .prepare('SELECT data, expires_at FROM cache WHERE key = ? AND expires_at > ?')
        .bind(key, Date.now())
        .first<{ data: string; expires_at: number }>();

      if (!result) {
        return null;
      }

      return JSON.parse(result.data) as T;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached data with TTL (time to live in seconds)
   */
  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    try {
      const expiresAt = Date.now() + (ttlSeconds * 1000);
      const serialized = JSON.stringify(data);

      await this.db
        .prepare(`
          INSERT INTO cache (key, data, expires_at) 
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET 
            data = excluded.data,
            expires_at = excluded.expires_at
        `)
        .bind(key, serialized, expiresAt)
        .run();
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Delete cached entry
   */
  async delete(key: string): Promise<void> {
    try {
      await this.db
        .prepare('DELETE FROM cache WHERE key = ?')
        .bind(key)
        .run();
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Clear all expired entries
   */
  async clearExpired(): Promise<number> {
    try {
      const result = await this.db
        .prepare('DELETE FROM cache WHERE expires_at <= ?')
        .bind(Date.now())
        .run();
      return result.meta?.changes || 0;
    } catch (error) {
      console.error('Cache clear expired error:', error);
      return 0;
    }
  }

  /**
   * Clear all cache entries
   */
  async clearAll(): Promise<void> {
    try {
      await this.db.prepare('DELETE FROM cache').run();
    } catch (error) {
      console.error('Cache clear all error:', error);
    }
  }
}

/**
 * Create cache instance from Astro context
 * Usage in API routes: const cache = createCache(context.locals.runtime.env.DB)
 */
export function createCache(db: D1Database | undefined): Cache | null {
  if (!db) {
    console.warn('No database available for caching');
    return null;
  }
  return new Cache(db);
}

/**
 * Fetch with caching wrapper
 * Automatically caches successful responses
 */
export async function fetchWithCache<T>(
  cache: Cache | null,
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  // Try to get from cache first
  if (cache) {
    const cached = await cache.get<T>(cacheKey);
    if (cached !== null) {
      console.log(`Cache hit for ${cacheKey}`);
      return cached;
    }
  }

  // Fetch fresh data
  console.log(`Cache miss for ${cacheKey}, fetching fresh data`);
  const data = await fetcher();

  // Store in cache
  if (cache) {
    await cache.set(cacheKey, data, ttlSeconds);
  }

  return data;
}
