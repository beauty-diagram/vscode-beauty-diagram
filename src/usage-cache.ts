// usage-cache — short-lived cache for the `/v1/usage` API response.
//
// Used by the share-mode toggle command (plan gating) and the settings
// tab quota hint. Cached for 5 minutes by default — long enough that
// repeated command invocations don't round-trip to the server, short
// enough that an upgrade / downgrade reflects without restarting the
// plugin. `invalidate()` clears the cache when we know plan state may
// have changed (e.g. after Verify API key succeeds).
//
// Failures are deliberately not cached. If the network is down the
// next call retries. This keeps the toggle command responsive once
// connectivity is restored, instead of latching to "unknown" for the
// full TTL.

import type { UsageResponse } from './api-client'

export type Plan = 'free' | 'pro' | 'premium' | 'unknown'

const KNOWN_PLANS: ReadonlySet<string> = new Set(['free', 'pro', 'premium'])

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface UsageApi {
  getUsage(): Promise<UsageResponse>
}

interface CacheEntry {
  usage: UsageResponse
  expiresAt: number
}

export class UsageCache {
  private entry: CacheEntry | null = null

  constructor(
    private readonly api: UsageApi,
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  /** Returns the cached `/v1/usage` response, or null if the call fails. */
  async get(): Promise<UsageResponse | null> {
    if (this.entry && this.entry.expiresAt > this.now()) {
      return this.entry.usage
    }
    try {
      const usage = await this.api.getUsage()
      this.entry = { usage, expiresAt: this.now() + this.ttlMs }
      return usage
    } catch {
      // Don't cache failures — the next call should retry. Returning
      // null (rather than throwing) lets callers degrade gracefully.
      return null
    }
  }

  /** Narrows the server-returned plan string to our known set, or 'unknown'. */
  async getPlan(): Promise<Plan> {
    const usage = await this.get()
    if (!usage) return 'unknown'
    return KNOWN_PLANS.has(usage.plan) ? (usage.plan as Plan) : 'unknown'
  }

  invalidate(): void {
    this.entry = null
  }
}
