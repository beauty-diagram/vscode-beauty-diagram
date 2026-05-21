import { shortHash } from './hash'
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

  private async makeKey(source: string, theme: string, type: SourceFormat): Promise<string> {
    return (
      (await shortHash(source + '\0' + theme + '\0' + type)) +
      (await shortHash('\x01' + source + theme + type))
    )
  }

  async get(source: string, theme: string, type: SourceFormat): Promise<string | null> {
    const key = await this.makeKey(source, theme, type)
    const rows = this.readAll()
    const row = rows.find((r) => r.key === key)
    if (!row) return null
    if (row.expiresAt < Date.now()) return null
    return row.id
  }

  async set(source: string, theme: string, type: SourceFormat, id: string): Promise<void> {
    const key = await this.makeKey(source, theme, type)
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
}
