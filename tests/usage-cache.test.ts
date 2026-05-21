import { describe, it, expect, vi } from 'vitest'
import { UsageCache } from '../src/usage-cache'
import type { UsageResponse } from '../src/api-client'

const proUsage: UsageResponse = {
  ok: true,
  plan: 'pro',
  exports: { used: 9, limit: 100, resetsAt: '2026-06-01T00:00:00.000Z' },
}

const freeUsage: UsageResponse = {
  ok: true,
  plan: 'free',
}

function makeApi(impls: Array<UsageResponse | Error>) {
  let call = 0
  return {
    getUsage: vi.fn().mockImplementation(() => {
      const next = impls[call++]
      if (next instanceof Error) return Promise.reject(next)
      return Promise.resolve(next)
    }),
  }
}

describe('UsageCache', () => {
  it('fetches usage on first call', async () => {
    const api = makeApi([proUsage])
    const cache = new UsageCache(api, () => 0)
    const usage = await cache.get()
    expect(usage).toEqual(proUsage)
    expect(api.getUsage).toHaveBeenCalledTimes(1)
  })

  it('returns cached snapshot within TTL (5 minutes default)', async () => {
    const api = makeApi([proUsage])
    let now = 1_000_000
    const cache = new UsageCache(api, () => now)
    await cache.get()
    now += 4 * 60 * 1000 // 4 min later — still within TTL
    const usage = await cache.get()
    expect(usage).toEqual(proUsage)
    expect(api.getUsage).toHaveBeenCalledTimes(1)
  })

  it('refetches after TTL expires', async () => {
    const api = makeApi([proUsage, { ...proUsage, exports: { used: 20, limit: 100, resetsAt: 'x' } }])
    let now = 0
    const cache = new UsageCache(api, () => now)
    await cache.get()
    now = 6 * 60 * 1000 // 6 min — past TTL
    const updated = await cache.get()
    expect(updated?.exports?.used).toBe(20)
    expect(api.getUsage).toHaveBeenCalledTimes(2)
  })

  it('returns null on api error and does not throw', async () => {
    const api = makeApi([new Error('network down')])
    const cache = new UsageCache(api, () => 0)
    const usage = await cache.get()
    expect(usage).toBeNull()
  })

  it('does not cache failures — next call retries', async () => {
    const api = makeApi([new Error('flake'), proUsage])
    const cache = new UsageCache(api, () => 0)
    expect(await cache.get()).toBeNull()
    expect(await cache.get()).toEqual(proUsage)
    expect(api.getUsage).toHaveBeenCalledTimes(2)
  })

  it('getPlan narrows server plan to recognized set', async () => {
    const api = makeApi([proUsage])
    const cache = new UsageCache(api, () => 0)
    expect(await cache.getPlan()).toBe('pro')
  })

  it('getPlan returns free plan correctly', async () => {
    const api = makeApi([freeUsage])
    const cache = new UsageCache(api, () => 0)
    expect(await cache.getPlan()).toBe('free')
  })

  it('getPlan returns unknown when api fails', async () => {
    const api = makeApi([new Error('boom')])
    const cache = new UsageCache(api, () => 0)
    expect(await cache.getPlan()).toBe('unknown')
  })

  it('getPlan returns unknown for unrecognized plan string (forward compat)', async () => {
    const api = makeApi([{ ok: true, plan: 'enterprise-vip' as any }])
    const cache = new UsageCache(api, () => 0)
    expect(await cache.getPlan()).toBe('unknown')
  })

  it('invalidate forces a fresh fetch on next call', async () => {
    const api = makeApi([proUsage, { ...proUsage, exports: { used: 50, limit: 100, resetsAt: 'x' } }])
    const cache = new UsageCache(api, () => 0)
    await cache.get()
    cache.invalidate()
    const refreshed = await cache.get()
    expect(refreshed?.exports?.used).toBe(50)
    expect(api.getUsage).toHaveBeenCalledTimes(2)
  })

  it('accepts a custom TTL', async () => {
    const api = makeApi([proUsage, proUsage])
    let now = 0
    const cache = new UsageCache(api, () => now, 1000) // 1-second TTL
    await cache.get()
    now = 1500
    await cache.get()
    expect(api.getUsage).toHaveBeenCalledTimes(2)
  })
})
