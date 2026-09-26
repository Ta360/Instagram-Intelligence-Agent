/** Small in-memory TTL cache (per process). */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number; storedAt: number }>();

  constructor(
    private ttlMs: number,
    private maxEntries = 500,
  ) {}

  get(key: string): { value: V; storedAt: number } | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return { value: hit.value, storedAt: hit.storedAt };
  }

  set(key: string, value: V) {
    if (this.ttlMs <= 0) return;
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs, storedAt: Date.now() });
  }

  delete(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}
