import { describe, it, expect, vi, afterEach } from 'vitest'
import MarkdownIt from 'markdown-it'
import { bdMarkdownItPlugin, setBdShareContext } from '../src/markdown-it-plugin'
import { ShareCache } from '../src/share-cache'
import { shortHashSync } from '../src/hash'
import * as vscode from 'vscode'

class FakeMemento {
  private store = new Map<string, unknown>()
  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.store.has(key) ? this.store.get(key) : defaultValue) as T | undefined
  }
  update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) this.store.delete(key)
    else this.store.set(key, value)
    return Promise.resolve()
  }
  keys(): readonly string[] {
    return Array.from(this.store.keys())
  }
}

afterEach(() => {
  setBdShareContext(null)
})

function setConfig(overrides: Record<string, unknown>) {
  vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
    get: <T>(key: string, dflt?: T): T | undefined => {
      if (key in overrides) return overrides[key] as T
      return dflt
    },
    update: vi.fn(),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>)
}

describe('bdMarkdownItPlugin', () => {
  it('rewrites mermaid fence to <img> hitting /v1/beautify.svg', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\nflowchart LR\n  A --> B\n```')
    expect(html).toContain('<img')
    expect(html).toMatch(/src="https:\/\/api\.beauty-diagram\.com\/v1\/beautify\.svg\?source=[^"]+&amp;theme=classic&amp;sourceFormat=mermaid"/)
    expect(html).toContain('class="bd-img"')
  })

  it('honors per-block bd:theme directive', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\n%% bd:theme=memphis\nflowchart LR\n  A --> B\n```')
    expect(html).toMatch(/theme=memphis/)
  })

  it('appends bg=transparent when directive present', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\n%% bd:bg=transparent\nflowchart LR\n  A --> B\n```')
    expect(html).toMatch(/bg=transparent/)
  })

  it('rewrites plantuml fence with sourceFormat=plantuml', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```plantuml\n@startuml\nA --> B\n@enduml\n```')
    expect(html).toMatch(/sourceFormat=plantuml/)
  })

  it('falls through to default fence when replaceMermaid is false', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: false, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\nflowchart LR\n```')
    expect(html).not.toContain('beautify.svg')
    expect(html).toContain('<pre>')
    expect(html).toContain('mermaid')
  })

  it('falls through to default fence when handlePlantuml is false', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: false, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```plantuml\n@startuml\nA --> B\n@enduml\n```')
    expect(html).not.toContain('beautify.svg')
  })

  it('shows a >5KB warning instead of broken URL', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com', apiKey: '' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const big = 'A --> B\n'.repeat(700)
    const html = md.render('```mermaid\n' + big + '```')
    expect(html).not.toContain('beautify.svg')
    expect(html).toContain('5 KB')
  })

  it('leaves non-mermaid/plantuml fences untouched', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```bash\necho hello\n```')
    expect(html).not.toContain('beautify.svg')
    expect(html).toContain('<pre>')
  })

  it('wraps rendered diagram in bd-block with Open-in-editor badge', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\nflowchart LR\n  A --> B\n```')
    expect(html).toContain('<span class="bd-block">')
    expect(html).toContain('class="bd-edit-badge"')
    expect(html).toContain('beauty-diagram.com/editor')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  describe('share mode (frontmatter bd-share: true)', () => {
    const apiBase = 'https://api.beauty-diagram.com'

    it('emits /v1/share/<token>.svg when cache hit and context wired', async () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase, apiKey: 'bd_live_k' })
      const cache = new ShareCache(new FakeMemento())
      // markdown-it fence token.content always carries a trailing newline,
      // so the cache key the fence rule will look up matches the source +
      // '\n'. The toggle command's pre-fetch step parses the same way, so
      // this is the canonical key shape for share-mode cache entries.
      const cleanSource = 'flowchart LR\n  A --> B\n'
      const ownerTag = shortHashSync('owner:bd_live_k')
      await cache.set(cleanSource, 'classic', 'mermaid', 'tok_abc', ownerTag)

      setBdShareContext({ cache, getApiKey: () => 'bd_live_k' })
      const md = new MarkdownIt().use(bdMarkdownItPlugin)
      const html = md.render('---\nbd-share: true\n---\n\n```mermaid\nflowchart LR\n  A --> B\n```')

      expect(html).toContain('/v1/share/tok_abc.svg')
      expect(html).toContain('data-bd-mode="share"')
      expect(html).not.toContain('beautify.svg')
    })

    it('falls back to anonymous + hint when share mode is on but cache misses', () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase, apiKey: 'bd_live_k' })
      const cache = new ShareCache(new FakeMemento())
      setBdShareContext({ cache, getApiKey: () => 'bd_live_k' })

      const md = new MarkdownIt().use(bdMarkdownItPlugin)
      const html = md.render('---\nbd-share: true\n---\n\n```mermaid\nflowchart LR\n```')

      expect(html).toContain('beautify.svg')   // anonymous fallback
      expect(html).toContain('Share mode is on')   // hint banner
      expect(html).toContain('Toggle share mode')
    })

    it('ignores frontmatter when share context is not wired (defensive)', () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase, apiKey: 'bd_live_k' })
      // no setBdShareContext — simulates extension not yet activated
      const md = new MarkdownIt().use(bdMarkdownItPlugin)
      const html = md.render('---\nbd-share: true\n---\n\n```mermaid\nflowchart LR\n```')

      expect(html).toContain('beautify.svg')   // anonymous only
      expect(html).not.toContain('Share mode is on')   // no hint without context
    })

    it('renders anonymously when frontmatter does not opt in to share', () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase, apiKey: 'bd_live_k' })
      const cache = new ShareCache(new FakeMemento())
      setBdShareContext({ cache, getApiKey: () => 'bd_live_k' })

      const md = new MarkdownIt().use(bdMarkdownItPlugin)
      // frontmatter present but bd-share is not true
      const html = md.render('---\ntitle: Foo\n---\n\n```mermaid\nflowchart LR\n```')

      expect(html).toContain('beautify.svg')
      expect(html).not.toContain('/v1/share/')
      expect(html).not.toContain('Share mode is on')
    })
  })
})
