const CACHE_TTL = 30_000;

const _caches = new Map<string, { items: unknown[]; hasMore: boolean; fetchedAt: number }>();

export function getHistoryCache<T>(userId: string): { items: T[]; hasMore: boolean } | null {
  const entry = _caches.get(userId);
  if (!entry || Date.now() - entry.fetchedAt >= CACHE_TTL) return null;
  return { items: entry.items as T[], hasMore: entry.hasMore };
}

export function setHistoryCache(userId: string, items: unknown[], hasMore: boolean): void {
  _caches.set(userId, { items, hasMore, fetchedAt: Date.now() });
}

export function invalidateHistoryCache(userId?: string): void {
  if (userId) {
    _caches.delete(userId);
  } else {
    _caches.clear();
  }
}
