import { describe, it, expect, vi } from 'vitest'
import { createApiClient, ApiError } from '../src/api-client'

function mockFetchOk(body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch
}

describe('api-client', () => {
  it('createShare posts with auth + X-Bd-Client and parses response', async () => {
    const body = {
      diagramId: 'd1', shareToken: 'tk1', sharePath: '/s/tk1',
      shareUrl: 'https://www.beauty-diagram.com/s/tk1',
      title: null, diagramType: 'flowchart',
    }
    const mockFetch = mockFetchOk(body)
    const client = createApiClient({
      apiBase: 'https://api.beauty-diagram.com',
      apiKey: 'bd_live_xxx',
      version: '0.1.0',
      fetchFn: mockFetch,
    })

    const r = await client.createShare({ source: 'A --> B', theme: 'modern', sourceFormat: 'mermaid' })
    expect(r).toEqual(body)

    const [url, init] = (mockFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.beauty-diagram.com/v1/share')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer bd_live_xxx')
    expect((init.headers as Record<string, string>)['X-Bd-Client']).toBe('vscode')

    const sentBody = JSON.parse(init.body as string)
    expect(sentBody).toEqual({ source: 'A --> B', theme: 'modern', sourceFormat: 'mermaid' })
  })

  it('createShare omits Authorization when no apiKey', async () => {
    const mockFetch = mockFetchOk({ shareToken: 'x', diagramId: 'x', sharePath: '/s/x', shareUrl: 'x', title: null, diagramType: 'flowchart' })
    const client = createApiClient({
      apiBase: 'https://api.beauty-diagram.com',
      apiKey: null, version: '0.1.0', fetchFn: mockFetch,
    })
    await client.createShare({ source: 'A', theme: 'modern', sourceFormat: 'mermaid' })
    const [, init] = (mockFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('throws ApiError(429, "quota_exhausted") on rate-limited response', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'quota_exhausted', message: 'Monthly quota used.' }), {
        status: 429, headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch
    const client = createApiClient({
      apiBase: 'https://api.beauty-diagram.com', apiKey: 'k', version: '0.1.0', fetchFn: mockFetch,
    })
    await expect(
      client.createShare({ source: 'A', theme: 'modern', sourceFormat: 'mermaid' }),
    ).rejects.toMatchObject({ status: 429, code: 'quota_exhausted' })
  })

  it('wraps transport errors as ApiError(0, "network_error")', async () => {
    const mockFetch = vi.fn(async () => { throw new Error('fetch failed') }) as unknown as typeof fetch
    const client = createApiClient({
      apiBase: 'https://api.beauty-diagram.com', apiKey: 'k', version: '0.1.0', fetchFn: mockFetch,
    })
    await expect(client.getUsage()).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })

  it('getThemes returns the themes array', async () => {
    const mockFetch = mockFetchOk({ themes: [{ id: 'modern', name: 'Modern', tier: 'free' }] })
    const client = createApiClient({
      apiBase: 'https://api.beauty-diagram.com', apiKey: null, version: '0.1.0', fetchFn: mockFetch,
    })
    expect(await client.getThemes()).toEqual([{ id: 'modern', name: 'Modern', tier: 'free' }])
  })

  it('ApiError is an Error subclass with status and code', () => {
    const e = new ApiError(403, 'forbidden', 'Nope')
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(403)
    expect(e.code).toBe('forbidden')
    expect(e.message).toBe('Nope')
  })
})
