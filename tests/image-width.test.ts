import { describe, it, expect } from 'vitest'
import {
  parsePageWidth,
  setPageWidth,
  resolveEffectiveWidth,
  widthToInlineStyle,
  IMAGE_WIDTH_PRESETS,
} from '../src/image-width'

describe('parsePageWidth', () => {
  it('returns null for doc without front-matter', () => {
    expect(parsePageWidth('# Hello\n\nflowchart LR\n  A --> B')).toBeNull()
  })

  it('returns null for empty front-matter', () => {
    expect(parsePageWidth('---\n---\n\n# Hello')).toBeNull()
  })

  it('returns null when bd-width is absent from front-matter', () => {
    expect(parsePageWidth('---\nbd-share: true\n---\n\n# Hello')).toBeNull()
  })

  it('parses bd-width: full', () => {
    expect(parsePageWidth('---\nbd-width: full\n---\n')).toBe('full')
  })

  it('parses bd-width: 800px', () => {
    expect(parsePageWidth('---\nbd-width: 800px\n---\n')).toBe('800px')
  })

  it('parses bd-width: 75%', () => {
    expect(parsePageWidth('---\nbd-width: 75%\n---\n')).toBe('75%')
  })

  it('parses bd-width: 40em', () => {
    expect(parsePageWidth('---\nbd-width: 40em\n---\n')).toBe('40em')
  })

  it('parses bd-width: 28rem', () => {
    expect(parsePageWidth('---\nbd-width: 28rem\n---\n')).toBe('28rem')
  })

  it('tolerates trailing YAML comment', () => {
    expect(parsePageWidth('---\nbd-width: 640px  # medium\n---\n')).toBe('640px')
  })

  it('tolerates quoted values', () => {
    expect(parsePageWidth('---\nbd-width: "800px"\n---\n')).toBe('800px')
    expect(parsePageWidth("---\nbd-width: '640px'\n---\n")).toBe('640px')
  })

  it('coexists with bd-share key', () => {
    const doc = '---\nbd-share: true\nbd-width: 800px\n---\n'
    expect(parsePageWidth(doc)).toBe('800px')
  })

  it('returns null for value without unit', () => {
    expect(parsePageWidth('---\nbd-width: 800\n---\n')).toBeNull()
  })

  it('returns null for negative value', () => {
    expect(parsePageWidth('---\nbd-width: -100px\n---\n')).toBeNull()
  })

  it('returns null for non-CSS-length string (XSS guard)', () => {
    expect(parsePageWidth('---\nbd-width: javascript:alert(1)\n---\n')).toBeNull()
    expect(parsePageWidth('---\nbd-width: <script>\n---\n')).toBeNull()
    expect(parsePageWidth('---\nbd-width: url(x)\n---\n')).toBeNull()
  })

  it('returns null for empty value', () => {
    expect(parsePageWidth('---\nbd-width:\n---\n')).toBeNull()
  })

  it('returns null for nested/array value', () => {
    expect(parsePageWidth('---\nbd-width: [800px]\n---\n')).toBeNull()
  })

  it('survives CRLF line endings', () => {
    expect(parsePageWidth('---\r\nbd-width: 800px\r\n---\r\n')).toBe('800px')
  })
})

describe('setPageWidth — setting a value', () => {
  it('prepends front-matter when none exists', () => {
    const result = setPageWidth('# Hello\n', '800px')
    expect(result).toContain('---\n')
    expect(result).toContain('bd-width: 800px')
    expect(result).toContain('# Hello')
    expect(parsePageWidth(result)).toBe('800px')
  })

  it('appends bd-width to existing front-matter', () => {
    const doc = '---\nbd-share: true\n---\n\n# Hello'
    const result = setPageWidth(doc, '640px')
    expect(parsePageWidth(result)).toBe('640px')
    // bd-share should still be there
    expect(result).toContain('bd-share: true')
  })

  it('replaces existing bd-width when re-setting', () => {
    const doc = '---\nbd-width: 800px\n---\n\n# Hello'
    const result = setPageWidth(doc, '480px')
    expect(parsePageWidth(result)).toBe('480px')
    // No double bd-width keys
    const widthKeyCount = (result.match(/bd-width:/g) ?? []).length
    expect(widthKeyCount).toBe(1)
  })

  it('is idempotent — setting the same value twice yields identical output', () => {
    const doc = '# Hello'
    const first = setPageWidth(doc, '640px')
    const second = setPageWidth(first, '640px')
    expect(second).toBe(first)
  })

  it('throws on invalid value (caller bug guard)', () => {
    expect(() => setPageWidth('', 'javascript:alert(1)')).toThrow()
    expect(() => setPageWidth('', '800')).toThrow()
  })
})

describe('setPageWidth — removing the override', () => {
  it('is no-op when bd-width is absent', () => {
    const doc = '---\nbd-share: true\n---\n\n# Hello'
    expect(setPageWidth(doc, null)).toBe(doc)
  })

  it('removes bd-width line + width comment from front-matter', () => {
    const doc =
      '---\n# Beauty Diagram: per-page diagram max-width override.\nbd-width: 800px\n---\n\n# Hello'
    const result = setPageWidth(doc, null)
    expect(parsePageWidth(result)).toBeNull()
    expect(result).not.toContain('bd-width:')
    expect(result).not.toContain('diagram max-width')
    expect(result).toContain('# Hello')
  })

  it('preserves bd-share comment when removing bd-width', () => {
    const doc =
      '---\n# Beauty Diagram: share-mode (watermark-free preview, consumes share quota per unique diagram).\nbd-share: true\nbd-width: 800px\n---\n\n# Hello'
    const result = setPageWidth(doc, null)
    expect(result).toContain('bd-share: true')
    expect(result).toContain('share-mode (watermark-free')
    expect(result).not.toContain('bd-width:')
  })

  it('drops front-matter fence entirely when nothing remains', () => {
    const doc =
      '---\n# Beauty Diagram: per-page diagram max-width override.\nbd-width: 800px\n---\n\n# Hello'
    const result = setPageWidth(doc, null)
    expect(result).not.toMatch(/^---/)
    expect(result).toContain('# Hello')
  })
})

describe('resolveEffectiveWidth — cascade', () => {
  it('returns page override when present', () => {
    expect(resolveEffectiveWidth('800px', '640px')).toBe('800px')
  })

  it('falls back to setting default when no override', () => {
    expect(resolveEffectiveWidth(null, '640px')).toBe('640px')
  })

  it('falls back to full when both null', () => {
    expect(resolveEffectiveWidth(null, null)).toBe('full')
  })

  it('rejects invalid override and falls through', () => {
    expect(resolveEffectiveWidth('invalid', '640px')).toBe('640px')
  })

  it('rejects invalid setting default and falls through', () => {
    expect(resolveEffectiveWidth(null, 'invalid')).toBe('full')
  })
})

describe('widthToInlineStyle', () => {
  it('returns empty string for full', () => {
    expect(widthToInlineStyle('full')).toBe('')
  })

  it('returns max-width style for px / % / em / rem', () => {
    expect(widthToInlineStyle('800px')).toBe('max-width: 800px;')
    expect(widthToInlineStyle('75%')).toBe('max-width: 75%;')
    expect(widthToInlineStyle('40em')).toBe('max-width: 40em;')
    expect(widthToInlineStyle('28rem')).toBe('max-width: 28rem;')
  })

  it('returns empty string for invalid value (defense-in-depth)', () => {
    expect(widthToInlineStyle('javascript:alert(1)')).toBe('')
    expect(widthToInlineStyle('800')).toBe('')
  })
})

describe('IMAGE_WIDTH_PRESETS', () => {
  it('exposes 4 presets', () => {
    expect(IMAGE_WIDTH_PRESETS).toHaveLength(4)
  })

  it('first preset is full', () => {
    expect(IMAGE_WIDTH_PRESETS[0].id).toBe('full')
    expect(IMAGE_WIDTH_PRESETS[0].value).toBe('full')
  })

  it('every preset value is valid', () => {
    for (const preset of IMAGE_WIDTH_PRESETS) {
      // Every preset must round-trip through parse + render without loss.
      const doc = setPageWidth('', preset.value)
      expect(parsePageWidth(doc)).toBe(preset.value)
    }
  })
})
