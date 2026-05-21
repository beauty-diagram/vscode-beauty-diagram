import { describe, it, expect } from 'vitest'
import { shortHash } from '../src/hash'

describe('shortHash', () => {
  it('returns 8 lowercase hex chars', async () => {
    const h = await shortHash('hello')
    expect(h).toMatch(/^[0-9a-f]{8}$/)
  })

  it('is deterministic', async () => {
    const a = await shortHash('flowchart LR\n  A --> B')
    const b = await shortHash('flowchart LR\n  A --> B')
    expect(a).toBe(b)
  })

  it('differs when content differs', async () => {
    const a = await shortHash('A')
    const b = await shortHash('B')
    expect(a).not.toBe(b)
  })

  it('handles UTF-8 (CJK)', async () => {
    const h = await shortHash('中文')
    expect(h).toMatch(/^[0-9a-f]{8}$/)
  })

  it('matches a known SHA-256 prefix', async () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(await shortHash('hello')).toBe('2cf24dba')
  })
})
