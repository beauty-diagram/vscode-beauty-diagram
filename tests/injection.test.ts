import { describe, it, expect } from 'vitest'
import { injectEmbeds, cleanEmbeds } from '../src/injection'

describe('injectEmbeds', () => {
  const opts = {
    theme: 'modern',
    hasApiKey: false,
    shareIdForSource: async () => null,
  }

  it('injects embed below a single mermaid fence', async () => {
    const md = '# Doc\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nEnd.'
    const out = await injectEmbeds(md, opts)
    expect(out).toContain('```mermaid')
    expect(out).toMatch(/<!-- bd:inline-img hash=[0-9a-f]{8} -->/)
    expect(out).toMatch(/!\[Diagram 1\]\(https:\/\/api\.beauty-diagram\.com\/v1\/beautify\.svg\?source=/)
    expect(out).toContain('<!-- /bd:inline-img -->')
    expect(out.indexOf('End.')).toBeGreaterThan(out.indexOf('/bd:inline-img'))
  })

  it('numbers diagrams sequentially', async () => {
    const md = '```mermaid\nA --> B\n```\n\n```mermaid\nC --> D\n```'
    const out = await injectEmbeds(md, opts)
    expect(out).toContain('![Diagram 1]')
    expect(out).toContain('![Diagram 2]')
  })

  it('emits <img> form with inline style + display:block when widthStyle is provided', async () => {
    const md = '```mermaid\nA --> B\n```'
    const out = await injectEmbeds(md, { ...opts, widthStyle: 'max-width: 800px' })
    expect(out).toContain('<img alt="Diagram 1"')
    // display:block forces each embed onto its own row when multiple
    // narrow embeds would otherwise sit as inline siblings.
    expect(out).toContain('style="max-width: 800px; display: block"')
    expect(out).not.toMatch(/!\[Diagram 1\]\(/)
    // Marker shape stays the same → still idempotent + clean-able
    expect(out).toMatch(/<!-- bd:inline-img hash=[0-9a-f]{8} -->/)
    expect(out).toContain('<!-- /bd:inline-img -->')
  })

  it('upgrades an existing markdown-form embed to <img> when widthStyle is newly set', async () => {
    const md = '```mermaid\nA --> B\n```'
    // First inject with no widthStyle → markdown form
    const baseline = await injectEmbeds(md, opts)
    expect(baseline).toMatch(/!\[Diagram 1\]\(/)
    expect(baseline).not.toContain('<img')
    // Same hash, same source — but widthStyle is now set. Idempotency
    // must NOT skip; the marker should be rewritten in HTML form.
    const upgraded = await injectEmbeds(baseline, { ...opts, widthStyle: 'max-width: 640px' })
    expect(upgraded).not.toBe(baseline)
    expect(upgraded).toContain('<img alt="Diagram 1"')
    expect(upgraded).toContain('style="max-width: 640px; display: block"')
    expect(upgraded).not.toMatch(/!\[Diagram 1\]\(/)
  })

  it('downgrades an HTML-form embed back to markdown when widthStyle is cleared', async () => {
    const md = '```mermaid\nA --> B\n```'
    const withStyle = await injectEmbeds(md, { ...opts, widthStyle: 'max-width: 800px' })
    expect(withStyle).toContain('<img')
    // Clear widthStyle → should rewrite back to markdown form
    const cleared = await injectEmbeds(withStyle, { ...opts, widthStyle: null })
    expect(cleared).toMatch(/!\[Diagram 1\]\(/)
    expect(cleared).not.toContain('<img')
  })

  it('updates the style value when widthStyle changes between runs', async () => {
    const md = '```mermaid\nA --> B\n```'
    const first = await injectEmbeds(md, { ...opts, widthStyle: 'max-width: 800px' })
    const second = await injectEmbeds(first, { ...opts, widthStyle: 'max-width: 480px' })
    expect(second).toContain('style="max-width: 480px; display: block"')
    expect(second).not.toContain('max-width: 800px')
  })

  it('refreshOnly mode preserves URL when updating style — never re-mints', async () => {
    const md = '```mermaid\nA --> B\n```'
    // Initial inject with a resolver returning a stable token
    const initial = await injectEmbeds(md, {
      ...opts,
      widthStyle: 'max-width: 960px',
      shareIdForSource: async () => 'tok_original',
    })
    expect(initial).toContain('v1/share/tok_original.svg')
    expect(initial).toContain('style="max-width: 960px; display: block"')

    // Now "change bd-width" via refreshOnly — supply a resolver that WOULD
    // mint a different token if called, but refreshOnly must reuse the
    // existing URL verbatim instead.
    const refreshed = await injectEmbeds(initial, {
      ...opts,
      widthStyle: 'max-width: 320px',
      refreshOnly: true,
      shareIdForSource: async () => 'tok_BUG_should_not_appear',
    })
    expect(refreshed).toContain('v1/share/tok_original.svg')
    expect(refreshed).not.toContain('tok_BUG_should_not_appear')
    expect(refreshed).toContain('style="max-width: 320px; display: block"')
    expect(refreshed).not.toContain('max-width: 960px')
  })

  it('refreshOnly mode does not add embeds to bare fences', async () => {
    const md = '```mermaid\nA --> B\n```'  // no marker yet
    const out = await injectEmbeds(md, {
      ...opts,
      widthStyle: 'max-width: 320px',
      refreshOnly: true,
    })
    expect(out).toBe(md)  // truly untouched
  })

  it('refreshOnly mode also downgrades HTML form back to markdown when widthStyle is cleared', async () => {
    const md = '```mermaid\nA --> B\n```'
    const withStyle = await injectEmbeds(md, {
      ...opts,
      widthStyle: 'max-width: 800px',
      shareIdForSource: async () => 'tok_xyz',
    })
    expect(withStyle).toContain('<img')
    // refreshOnly + cleared widthStyle: rewrite back to ![](url) markdown form
    const cleared = await injectEmbeds(withStyle, {
      ...opts,
      widthStyle: null,
      refreshOnly: true,
      shareIdForSource: async () => 'tok_BUG_should_not_appear',
    })
    expect(cleared).toMatch(/!\[Diagram 1\]\(.*tok_xyz/)
    expect(cleared).not.toContain('<img')
    expect(cleared).not.toContain('tok_BUG_should_not_appear')
  })

  it('falls back to markdown image form when widthStyle is empty/null', async () => {
    const md = '```mermaid\nA --> B\n```'
    const out1 = await injectEmbeds(md, { ...opts, widthStyle: null })
    const out2 = await injectEmbeds(md, { ...opts, widthStyle: '' })
    expect(out1).toMatch(/!\[Diagram 1\]\(/)
    expect(out2).toMatch(/!\[Diagram 1\]\(/)
    expect(out1).not.toContain('<img')
    expect(out2).not.toContain('<img')
  })

  it('is idempotent when hash matches', async () => {
    const md = '```mermaid\nA --> B\n```'
    const first = await injectEmbeds(md, opts)
    const second = await injectEmbeds(first, opts)
    expect(second).toBe(first)
  })

  it('replaces embed when source changes (hash differs)', async () => {
    const before = '```mermaid\nA --> B\n```'
    const after = '```mermaid\nA --> C\n```'
    const firstOut = await injectEmbeds(before, opts)
    const oldHash = firstOut.match(/hash=([0-9a-f]{8})/)![1]

    const swapped = firstOut.replace(before, after)
    const secondOut = await injectEmbeds(swapped, opts)
    const newHash = secondOut.match(/hash=([0-9a-f]{8})/)![1]
    expect(newHash).not.toBe(oldHash)
    expect(secondOut.match(/hash=/g)!.length).toBe(1) // not duplicated
  })

  it('handles plantuml fences', async () => {
    const md = "```plantuml\n@startuml\nA --> B\n@enduml\n```"
    const out = await injectEmbeds(md, opts)
    expect(out).toContain('sourceFormat=plantuml')
  })

  it('respects per-block theme directive when computing URL', async () => {
    const md = '```mermaid\n%% bd:theme=classic\nflowchart LR\n```'
    const out = await injectEmbeds(md, opts)
    expect(out).toContain('theme=classic')
  })
})

describe('cleanEmbeds', () => {
  it('removes orphan embeds (preceding fence deleted)', async () => {
    const md = '<!-- bd:inline-img hash=abc12345 -->\n![Diagram 1](https://api.beauty-diagram.com/v1/beautify.svg?source=AA)\n<!-- /bd:inline-img -->\n\n# No fence above'
    const out = await cleanEmbeds(md)
    expect(out).not.toContain('bd:inline-img')
    expect(out).toContain('# No fence above')
  })

  it('keeps embeds that follow a matching fence', async () => {
    const md = '```mermaid\nA --> B\n```\n<!-- bd:inline-img hash=abc12345 -->\n![Diagram 1](https://api.beauty-diagram.com/v1/beautify.svg?source=AA)\n<!-- /bd:inline-img -->'
    const out = await cleanEmbeds(md)
    expect(out).toContain('bd:inline-img')
  })
})
