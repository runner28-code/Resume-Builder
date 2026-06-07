const CACHE_TTL = 30_000;

let _cache: { items: unknown[]; hasMore: boolean; fetchedAt: number } | null = null;

export function getHistoryCache<T>(): { items: T[]; hasMore: boolean } | null {
  if (!_cache || Date.now() - _cache.fetchedAt >= CACHE_TTL) return null;
  return { items: _cache.items as T[], hasMore: _cache.hasMore };
}

export function setHistoryCache(items: unknown[], hasMore: boolean): void {
  _cache = { items, hasMore, fetchedAt: Date.now() };
}

export function invalidateHistoryCache(): void {
  _cache = null;
}
