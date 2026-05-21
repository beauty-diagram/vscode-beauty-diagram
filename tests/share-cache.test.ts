import { describe, it, expect, beforeEach } from 'vitest'
import { ShareCache } from '../src/share-cache'

class FakeMemento {
  private store = new Map<string, unknown>()
  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.store.has(key) ? this.store.get(key) : defaultValue) as T | undefined
  }
  update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) this.store.delete(key)
    else this.store.set(key, value)
    return Promise.resolve()
  }
  keys(): readonly string[] {
    return Array.from(this.store.keys())
  }
}

describe('ShareCache', () => {
  let memento: FakeMemento
  let cache: ShareCache

  beforeEach(() => {
    memento = new FakeMemento()
    cache = new ShareCache(memento, { maxEntries: 3, ttlMs: 1000 })
  })

  it('returns null on miss', async () => {
    expect(await cache.get('flow', 'modern', 'mermaid')).toBeNull()
  })

  it('round-trips a value', async () => {
    await cache.set('flow', 'modern', 'mermaid', 'tk_abc')
    expect(await cache.get('flow', 'modern', 'mermaid')).toBe('tk_abc')
  })

  it('differentiates by theme', async () => {
    await cache.set('flow', 'modern', 'mermaid', 'aaa')
    await cache.set('flow', 'classic', 'mermaid', 'bbb')
    expect(await cache.get('flow', 'modern', 'mermaid')).toBe('aaa')
    expect(await cache.get('flow', 'classic', 'mermaid')).toBe('bbb')
  })

  it('expires entries past TTL', async () => {
    await cache.set('flow', 'modern', 'mermaid', 'abc')
    await new Promise((r) => setTimeout(r, 1100))
    expect(await cache.get('flow', 'modern', 'mermaid')).toBeNull()
  })

  it('evicts oldest entry when exceeding maxEntries', async () => {
    await cache.set('s1', 'modern', 'mermaid', 'id1')
    await new Promise((r) => setTimeout(r, 5))
    await cache.set('s2', 'modern', 'mermaid', 'id2')
    await new Promise((r) => setTimeout(r, 5))
    await cache.set('s3', 'modern', 'mermaid', 'id3')
    await new Promise((r) => setTimeout(r, 5))
    await cache.set('s4', 'modern', 'mermaid', 'id4')

    expect(await cache.get('s1', 'modern', 'mermaid')).toBeNull()
    expect(await cache.get('s4', 'modern', 'mermaid')).toBe('id4')
  })

  it('clear() empties the cache', async () => {
    await cache.set('flow', 'modern', 'mermaid', 'abc')
    await cache.clear()
    expect(await cache.get('flow', 'modern', 'mermaid')).toBeNull()
  })

  it('isolates entries by ownerTag (no cross-key contamination)', async () => {
    await cache.set('flow', 'modern', 'mermaid', 'token-from-A', 'owner-A')
    await cache.set('flow', 'modern', 'mermaid', 'token-from-B', 'owner-B')
    expect(await cache.get('flow', 'modern', 'mermaid', 'owner-A')).toBe('token-from-A')
    expect(await cache.get('flow', 'modern', 'mermaid', 'owner-B')).toBe('token-from-B')
    // Default tag (anonymous) sees neither — owner-scoped entries are not aliased.
    expect(await cache.get('flow', 'modern', 'mermaid')).toBeNull()
  })

  it('treats omitted ownerTag as anonymous namespace', async () => {
    await cache.set('flow', 'modern', 'mermaid', 'anon-token')
    expect(await cache.get('flow', 'modern', 'mermaid')).toBe('anon-token')
    expect(await cache.get('flow', 'modern', 'mermaid', 'anon')).toBe('anon-token')
    // Authenticated owner cannot read the anonymous entry.
    expect(await cache.get('flow', 'modern', 'mermaid', 'owner-X')).toBeNull()
  })
})
