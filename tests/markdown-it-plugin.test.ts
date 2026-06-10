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
    expect(html).toMatch(/src="https:\/\/api\.beauty-diagram\.com\/v1\/beautify\.svg\?source=[^"]+&amp;theme=classic&amp;sourceFormat=mermaid&amp;onfail=status"/)
    expect(html).toContain('class="bd-img"')
  })

  it('mermaid img opts into detectable failures and carries the source for native fallback', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\nflowchart LR\n  A --> B\n```')
    expect(html).toContain('onfail=status')
    expect(html).toMatch(/data-bd-source="flowchart LR\n {2}A --&gt; B\n"/)
    // Fence output must stay a bare <img> — no wrapper / sibling markup
    // (wrapper HTML broke the preview pipeline in 0.1.9–0.1.11). The
    // fallback structure is injected by preview/bd-native-fallback.js.
    expect(html.trim()).toMatch(/^<img[^>]*\/>$/)
  })

  it('does not opt plantuml imgs into onfail (no native plantuml renderer)', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```plantuml\n@startuml\nA --> B\n@enduml\n```')
    expect(html).not.toContain('onfail=status')
    expect(html).not.toContain('data-bd-source=')
  })

  it('omits onfail and data-bd-source when fallbackToNativeRenderer is off', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com', fallbackToNativeRenderer: false })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\nflowchart LR\n  A --> B\n```')
    expect(html).not.toContain('onfail=status')
    expect(html).not.toContain('data-bd-source=')
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

  it('emits a bare <img> with no wrapper (0.1.9-0.1.11 wrapper broke VS Code preview)', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\nflowchart LR\n  A --> B\n```')
    expect(html).toContain('<img class="bd-img"')
    expect(html).not.toContain('<div class="bd-block"')
    expect(html).not.toContain('<span class="bd-block"')
    expect(html).not.toContain('bd-edit-badge')
  })

  it('skips empty mermaid fence (no <img>, falls back to default fence)', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\n```')
    expect(html).not.toContain('bd-img')
    expect(html).not.toContain('beautify.svg')
    expect(html).toContain('<pre>')   // default fence renderer
  })

  it('skips whitespace-only mermaid fence', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\n   \n\n```')
    expect(html).not.toContain('bd-img')
    expect(html).not.toContain('beautify.svg')
  })

  // NOTE: front_matter renderer suppression was removed in 0.1.17 — VS Code's
  // yamlPreamble extension overwrites third-party renderer.rules.front_matter
  // after our extendMarkdownIt runs (markdownEngine.ts:142-150), so the
  // approach was guaranteed dead in production. Suppression now lives in
  // preview/hide-bd-share.js (DOM-level via previewScripts). See that file
  // for the actual behavior; this describe block is kept as a documentation
  // anchor.
  describe.skip('front-matter suppression — moved to previewScript in 0.1.16', () => {
    // The frontmatter block rule from our share-mode tests' makeMd() helper
    // sets token.meta.content the same way VS Code's bundled rule does.
    // We re-use that here to exercise the production code path.
    function makeMdWithVsCodeFrontmatter() {
      const md = new MarkdownIt()
      md.block.ruler.before('fence', 'front_matter', (state, startLine, endLine, silent) => {
        if (startLine !== 0 || state.tShift[startLine] !== 0) return false
        const firstLine = state.src.slice(state.bMarks[startLine], state.eMarks[startLine]).replace(/\s+$/, '')
        if (firstLine !== '---') return false
        let nextLine = startLine + 1
        let foundEnd = false
        for (; nextLine < endLine; nextLine++) {
          if (state.tShift[nextLine] !== 0) continue
          const line = state.src.slice(state.bMarks[nextLine], state.eMarks[nextLine]).replace(/\s+$/, '')
          if (line === '---') { foundEnd = true; break }
        }
        if (!foundEnd) return false
        if (silent) return true
        const contentStart = state.bMarks[startLine + 1]
        const contentEnd = state.bMarks[nextLine]
        const rawContent = state.src.slice(contentStart, contentEnd).replace(/\n$/, '')
        const token = state.push('front_matter', '', 0)
        token.block = true
        token.hidden = false
        token.markup = '---'
        token.map = [startLine, nextLine + 1]
        token.meta = { content: rawContent }
        state.line = nextLine + 1
        return true
      }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
      // Simulate VS Code's default front_matter renderer (table style)
      md.renderer.rules.front_matter = (tokens, idx) => {
        const meta = tokens[idx].meta as { content?: string } | undefined
        return `<table class="bd-test-fm"><tbody><tr><td>${meta?.content ?? ''}</td></tr></tbody></table>\n`
      }
      md.use(bdMarkdownItPlugin)
      return md
    }

    it('hides front-matter containing bd-share marker', () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
      const md = makeMdWithVsCodeFrontmatter()
      const html = md.render('---\nbd-share: true\n---\n\n# Title')
      expect(html).not.toContain('bd-share')
      expect(html).not.toContain('bd-test-fm')   // default renderer should have been suppressed
      expect(html).toContain('<h1>Title</h1>')
    })

    it('renders front-matter normally when bd-share is absent', () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
      const md = makeMdWithVsCodeFrontmatter()
      const html = md.render('---\ntitle: Foo\ntags: [x]\n---\n\n# Title')
      expect(html).toContain('bd-test-fm')   // default renderer ran
      expect(html).toContain('title: Foo')
      expect(html).not.toContain('bd-share')
    })
  })

  describe('share mode (frontmatter bd-share: true)', () => {
    const apiBase = 'https://api.beauty-diagram.com'

    // Mimic VS Code's bundled front-matter block rule, which stores the
    // raw YAML body in token.meta.content (not token.content). Our fence
    // rule reads from there. The npm `markdown-it-front-matter` package
    // does NOT match VS Code's shape (it swallows content into a
    // callback), so we register our own minimal mimic instead.
    function makeMd() {
      const md = new MarkdownIt()
      md.block.ruler.before('fence', 'front_matter', (state, startLine, endLine, silent) => {
        if (startLine !== 0 || state.tShift[startLine] !== 0) return false
        const firstLine = state.src.slice(state.bMarks[startLine], state.eMarks[startLine]).replace(/\s+$/, '')
        if (firstLine !== '---') return false
        let nextLine = startLine + 1
        let foundEnd = false
        for (; nextLine < endLine; nextLine++) {
          if (state.tShift[nextLine] !== 0) continue
          const line = state.src.slice(state.bMarks[nextLine], state.eMarks[nextLine]).replace(/\s+$/, '')
          if (line === '---') { foundEnd = true; break }
        }
        if (!foundEnd) return false
        if (silent) return true
        const contentStart = state.bMarks[startLine + 1]
        const contentEnd = state.bMarks[nextLine]
        const rawContent = state.src.slice(contentStart, contentEnd).replace(/\n$/, '')
        const token = state.push('front_matter', '', 0)
        token.block = true
        token.hidden = false
        token.markup = '---'
        token.map = [startLine, nextLine + 1]
        token.meta = { content: rawContent }
        state.line = nextLine + 1
        return true
      }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
      md.use(bdMarkdownItPlugin)
      return md
    }

    it('emits /v1/share/<token>.svg when cache hit and context wired', async () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase, apiKey: 'bd_live_k' })
      const cache = new ShareCache(new FakeMemento())
      const cleanSource = 'flowchart LR\n  A --> B\n'
      const ownerTag = shortHashSync('owner:bd_live_k')
      await cache.set(cleanSource, 'classic', 'mermaid', 'tok_abc', ownerTag)

      setBdShareContext({ cache, getApiKey: () => 'bd_live_k' })
      const md = makeMd()
      const html = md.render('---\nbd-share: true\n---\n\n```mermaid\nflowchart LR\n  A --> B\n```')

      expect(html).toContain('/v1/share/tok_abc.svg')
      expect(html).toContain('data-bd-mode="share"')
      expect(html).not.toContain('beautify.svg')
    })

    it('falls back to anonymous silently when share mode is on but cache misses', async () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase, apiKey: 'bd_live_k' })
      const cache = new ShareCache(new FakeMemento())
      setBdShareContext({ cache, getApiKey: () => 'bd_live_k' })

      const md = makeMd()
      const html = md.render('---\nbd-share: true\n---\n\n```mermaid\nflowchart LR\n```')

      expect(html).toContain('beautify.svg')   // anonymous fallback
      expect(html).not.toContain('Share mode is on')   // hint banner removed in 0.1.12
    })

    it('ignores frontmatter when share context is not wired (defensive)', async () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase, apiKey: 'bd_live_k' })
      // no setBdShareContext — simulates extension not yet activated
      const md = makeMd()
      const html = md.render('---\nbd-share: true\n---\n\n```mermaid\nflowchart LR\n```')

      expect(html).toContain('beautify.svg')   // anonymous only
    })

    it('renders anonymously when frontmatter does not opt in to share', async () => {
      setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase, apiKey: 'bd_live_k' })
      const cache = new ShareCache(new FakeMemento())
      setBdShareContext({ cache, getApiKey: () => 'bd_live_k' })

      const md = makeMd()
      // frontmatter present but bd-share is not true
      const html = md.render('---\ntitle: Foo\n---\n\n```mermaid\nflowchart LR\n```')

      expect(html).toContain('beautify.svg')
      expect(html).not.toContain('/v1/share/')
    })
  })
})

describe('bd:exclude', () => {
  it('delegates excluded mermaid fences to the default renderer (native mermaid path)', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\n%% bd:exclude\nflowchart LR\n  A --> B\n```')
    expect(html).not.toContain('beautify.svg')
    expect(html).not.toContain('bd-img')
    // Default fence renderer output (flows into the built-in mermaid
    // extension's highlight hook in the real preview)
    expect(html).toContain('<pre>')
  })

  it('delegates excluded plantuml fences to the default renderer (plain code block)', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render("```plantuml\n' bd:exclude\n@startuml\nA --> B\n@enduml\n```")
    expect(html).not.toContain('beautify.svg')
  })

  it('bd:exclude=false still renders via Beauty Diagram', () => {
    setConfig({ defaultTheme: 'classic', replaceMermaid: true, handlePlantuml: true, apiBase: 'https://api.beauty-diagram.com' })
    const md = new MarkdownIt().use(bdMarkdownItPlugin)
    const html = md.render('```mermaid\n%% bd:exclude=false\nflowchart LR\n  A --> B\n```')
    expect(html).toContain('beautify.svg')
  })
})
