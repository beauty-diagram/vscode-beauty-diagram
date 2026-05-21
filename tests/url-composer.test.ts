import { describe, it, expect } from 'vitest'
import { composeUrl } from '../src/url-composer'

describe('composeUrl', () => {
  it('returns anonymous URL for small source in anonymous mode', () => {
    const r = composeUrl({
      source: 'flowchart LR\n  A --> B',
      theme: 'modern',
      sourceFormat: 'mermaid',
      mode: 'anonymous',
    })
    expect(r.kind).toBe('anonymous')
    if (r.kind === 'anonymous') {
      expect(r.url).toMatch(/^https:\/\/api\.beauty-diagram\.com\/v1\/beautify\.svg\?/)
      expect(r.url).toContain('theme=modern')
      expect(r.url).toContain('sourceFormat=mermaid')
      expect(r.url).toMatch(/source=[A-Za-z0-9_-]+/)
      // base64url-encoded source must have no padding '=' in its value
      const sourceMatch = r.url.match(/source=([^&]*)/)!
      expect(sourceMatch[1]).not.toContain('=')
    }
  })

  it('encodes UTF-8 source correctly (base64url, no padding)', () => {
    const r = composeUrl({
      source: '中文 → flow',
      theme: 'modern',
      sourceFormat: 'mermaid',
      mode: 'anonymous',
    })
    expect(r.kind).toBe('anonymous')
    if (r.kind === 'anonymous') {
      const m = r.url.match(/source=([^&]+)/)!
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/')
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
      )
      expect(decoded).toBe('中文 → flow')
    }
  })

  it('flags needs-share when page is in share mode (Pro opt-in)', () => {
    const r = composeUrl({
      source: 'flowchart LR\n  A --> B',
      theme: 'modern',
      sourceFormat: 'mermaid',
      mode: 'share',
    })
    expect(r).toEqual({ kind: 'needs-share', reason: 'share-mode' })
  })

  it('share mode wins over size — short source in share mode still returns share-mode reason', () => {
    const r = composeUrl({
      source: 'A --> B',
      theme: 'modern',
      sourceFormat: 'mermaid',
      mode: 'share',
    })
    expect(r).toEqual({ kind: 'needs-share', reason: 'share-mode' })
  })

  it('flags needs-share when anonymous source exceeds 5KB (over-size-cap)', () => {
    const big = 'A --> B\n'.repeat(700) // ~5.6 KB
    const r = composeUrl({
      source: big,
      theme: 'modern',
      sourceFormat: 'mermaid',
      mode: 'anonymous',
    })
    expect(r).toEqual({ kind: 'needs-share', reason: 'over-size-cap' })
  })

  it('uses UTF-8 byte length, not char length, for size check', () => {
    // 1800 CJK chars = 5400 UTF-8 bytes (3 bytes each), > 5 * 1024 = 5120 byte cap
    const cjk = '中'.repeat(1800)
    const r = composeUrl({
      source: cjk,
      theme: 'modern',
      sourceFormat: 'mermaid',
      mode: 'anonymous',
    })
    expect(r).toEqual({ kind: 'needs-share', reason: 'over-size-cap' })
  })

  it('appends bg=transparent when bg option is set', () => {
    const r = composeUrl({
      source: 'A --> B',
      theme: 'modern',
      sourceFormat: 'mermaid',
      mode: 'anonymous',
      bg: 'transparent',
    })
    expect(r.kind).toBe('anonymous')
    if (r.kind === 'anonymous') {
      expect(r.url).toContain('&bg=transparent')
    }
  })

  it('does not append bg param when bg option is absent', () => {
    const r = composeUrl({
      source: 'A --> B',
      theme: 'modern',
      sourceFormat: 'mermaid',
      mode: 'anonymous',
    })
    expect(r.kind).toBe('anonymous')
    if (r.kind === 'anonymous') {
      expect(r.url).not.toContain('bg=')
    }
  })

  it('honors custom apiBase', () => {
    const r = composeUrl({
      source: 'A --> B',
      theme: 'modern',
      sourceFormat: 'mermaid',
      mode: 'anonymous',
      apiBase: 'http://localhost:8787',
    })
    expect(r.kind).toBe('anonymous')
    if (r.kind === 'anonymous') {
      expect(r.url).toMatch(/^http:\/\/localhost:8787\/v1\/beautify\.svg\?/)
    }
  })
})
