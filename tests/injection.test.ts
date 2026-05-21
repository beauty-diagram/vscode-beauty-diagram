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
