import { describe, it, expect } from 'vitest'
import { editorLink } from '../src/editor-link'

describe('editorLink', () => {
  it('produces URL with all three required params', () => {
    const url = editorLink({
      source: 'flowchart LR\n  A --> B',
      theme: 'modern',
      sourceFormat: 'mermaid',
    })
    expect(url).toMatch(/^https:\/\/www\.beauty-diagram\.com\/editor\?/)
    expect(url).toContain('format=mermaid')
    expect(url).toContain('theme=modern')
    expect(url).toMatch(/source=[^&]+/)
    expect(url).not.toContain('=&') // no empty params
  })

  it('URI-encodes the source as plain text (not base64) so Next.js auto-decodes', () => {
    const url = editorLink({
      source: 'flowchart LR\n  A --> B',
      theme: 'modern',
      sourceFormat: 'mermaid',
    })
    const m = url.match(/source=([^&]+)/)!
    // Round-trip via decodeURIComponent should recover the original plaintext.
    expect(decodeURIComponent(m[1])).toBe('flowchart LR\n  A --> B')
  })

  it('encodes plantuml format correctly', () => {
    const url = editorLink({
      source: '@startuml\nA --> B\n@enduml',
      theme: 'classic',
      sourceFormat: 'plantuml',
    })
    expect(url).toContain('format=plantuml')
    expect(url).toContain('theme=classic')
    const m = url.match(/source=([^&]+)/)!
    expect(decodeURIComponent(m[1])).toBe('@startuml\nA --> B\n@enduml')
  })

  it('round-trips UTF-8 source (CJK)', () => {
    const url = editorLink({
      source: '中文 diagram',
      theme: 'modern',
      sourceFormat: 'mermaid',
    })
    const m = url.match(/source=([^&]+)/)!
    expect(decodeURIComponent(m[1])).toBe('中文 diagram')
  })

  it('honors custom webBase', () => {
    const url = editorLink({
      source: 'A --> B',
      theme: 'modern',
      sourceFormat: 'mermaid',
      webBase: 'http://localhost:3000',
    })
    expect(url).toMatch(/^http:\/\/localhost:3000\/editor\?/)
  })

  it('escapes ampersand and equals so query parsing stays intact', () => {
    const url = editorLink({
      source: 'A & B = "ok"',
      theme: 'modern',
      sourceFormat: 'mermaid',
    })
    // The literal & in the source MUST be encoded so it doesn't break query parsing
    expect(url).not.toMatch(/source=A & B/)
    const m = url.match(/source=([^&]+)/)!
    expect(decodeURIComponent(m[1])).toBe('A & B = "ok"')
  })
})
