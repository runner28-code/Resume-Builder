export async function mapWithConcurrency<T, R = void>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const queue = items.map((item, i) => ({ item, i }));
  const results: R[] = new Array(items.length);
  // queue.shift() is synchronous → atomic in JS's single-threaded event loop, no mutex needed.
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const entry = queue.shift()!;
      results[entry.i] = await fn(entry.item);
    }
  });
  await Promise.all(workers);
  return results;
}
