import { describe, it, expect, vi } from 'vitest'
import MarkdownIt from 'markdown-it'
import { bdMarkdownItPlugin } from '../src/markdown-it-plugin'
import * as vscode from 'vscode'

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
})
