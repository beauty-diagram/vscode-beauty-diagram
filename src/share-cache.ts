import { shortHash, shortHashSync } from './hash'
import type { SourceFormat } from './types'

interface CacheRow {
  key: string
  id: string
  createdAt: number
  expiresAt: number
}

interface ShareCacheOptions {
  maxEntries?: number
  ttlMs?: number
}

interface MementoLike {
  get<T>(key: string, defaultValue?: T): T | undefined
  update(key: string, value: unknown): Thenable<void>
  keys(): readonly string[]
}

const STORAGE_KEY = 'beautyDiagram.shareCache'

export class ShareCache {
  private maxEntries: number
  private ttlMs: number

  constructor(private memento: MementoLike, opts: ShareCacheOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 1000
    this.ttlMs = opts.ttlMs ?? 7 * 24 * 60 * 60 * 1000
  }

  private readAll(): CacheRow[] {
    return this.memento.get<CacheRow[]>(STORAGE_KEY, []) ?? []
  }

  private async writeAll(rows: CacheRow[]): Promise<void> {
    await this.memento.update(STORAGE_KEY, rows)
  }

  private async makeKey(
    source: string,
    theme: string,
    type: SourceFormat,
    ownerTag: string,
  ): Promise<string> {
    // ownerTag namespaces entries so swapping API keys (different account /
    // plan tier) doesn't make Account B serve Account A's share token.
    // Anonymous callers use the literal 'anon' tag so their cache is shared
    // across the absence-of-key state but isolated from any authenticated owner.
    // Mirror of obsidian-beauty-diagram/src/share-cache.ts ownerTag fix.
    return (
      (await shortHash(ownerTag + '\0' + source + '\0' + theme + '\0' + type)) +
      (await shortHash('\x01' + ownerTag + source + theme + type))
    )
  }

  async get(
    source: string,
    theme: string,
    type: SourceFormat,
    ownerTag = 'anon',
  ): Promise<string | null> {
    const key = await this.makeKey(source, theme, type, ownerTag)
    const rows = this.readAll()
    const row = rows.find((r) => r.key === key)
    if (!row) return null
    if (row.expiresAt < Date.now()) return null
    return row.id
  }

  async set(
    source: string,
    theme: string,
    type: SourceFormat,
    id: string,
    ownerTag = 'anon',
  ): Promise<void> {
    const key = await this.makeKey(source, theme, type, ownerTag)
    const now = Date.now()
    const rows = this.readAll().filter((r) => r.key !== key)
    rows.push({ key, id, createdAt: now, expiresAt: now + this.ttlMs })
    if (rows.length > this.maxEntries) {
      rows.sort((a, b) => a.createdAt - b.createdAt)
      rows.splice(0, rows.length - this.maxEntries)
    }
    await this.writeAll(rows)
  }

  async clear(): Promise<void> {
    await this.memento.update(STORAGE_KEY, [])
  }

  /**
   * Synchronous lookup for the markdown-it fence rule. Fence runs in the
   * extension host (Node) and cannot await — we precompute the same key
   * derivation using node:crypto and read Memento (which is itself sync).
   * Mirrors `get` semantics: expired entries return null.
   *
   * Must produce byte-identical keys to `makeKey()`, otherwise async
   * writes from the toggle command's pre-fetch step won't be visible to
   * synchronous reads from fence rule. The two functions share their
   * input shape (source / theme / format / ownerTag) for this reason.
   */
  getSync(
    source: string,
    theme: string,
    type: SourceFormat,
    ownerTag = 'anon',
  ): string | null {
    const key = makeKeySync(source, theme, type, ownerTag)
    const rows = this.readAll()
    const row = rows.find((r) => r.key === key)
    if (!row) return null
    if (row.expiresAt < Date.now()) return null
    return row.id
  }
}

/**
 * Sync mirror of ShareCache.makeKey — kept as a free function so both
 * paths (async makeKey via shortHash, sync makeKey via shortHashSync)
 * use the same shape. Two shortHash calls + the exact same concatenation
 * order, otherwise async-write/sync-read combos miss.
 */
function makeKeySync(
  source: string,
  theme: string,
  type: SourceFormat,
  ownerTag: string,
): string {
  return (
    shortHashSync(ownerTag + '\0' + source + '\0' + theme + '\0' + type) +
    shortHashSync('\x01' + ownerTag + source + theme + type)
  )
}
