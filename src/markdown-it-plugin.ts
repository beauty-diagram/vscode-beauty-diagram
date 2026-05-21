import type MarkdownIt from 'markdown-it'
import { composeUrl } from './url-composer'
import { parseDirective } from './directives'
import { getConfig } from './settings'
import { ANON_SOURCE_BYTE_CAP } from './constants'
import type { SourceFormat } from './types'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function firstLine(s: string): string {
  for (const line of s.split('\n')) {
    const t = line.trim()
    if (t) return t.slice(0, 80)
  }
  return 'Diagram'
}

export function bdMarkdownItPlugin(md: MarkdownIt): void {
  console.log('[bd] bdMarkdownItPlugin: registering fence override')
  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const info = (token.info || '').trim().toLowerCase()
    console.log('[bd] fence rule fired, info:', JSON.stringify(info), 'replaceMermaid:', getConfig('replaceMermaid'), 'handlePlantuml:', getConfig('handlePlantuml'))

    if (info !== 'mermaid' && info !== 'plantuml') {
      return defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
    }
    const sourceFormat = info as SourceFormat

    if (sourceFormat === 'mermaid' && !getConfig('replaceMermaid')) {
      return defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
    }
    if (sourceFormat === 'plantuml' && !getConfig('handlePlantuml')) {
      return defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
    }

    const apiBase = getConfig('apiBase')
    const { overrides, source: cleanSource } = parseDirective(sourceFormat, token.content)
    const theme = overrides.theme ?? getConfig('defaultTheme')
    const bg = overrides.bg === 'transparent' ? ('transparent' as const) : undefined

    // Phase 1 of share-mode spec: fence rule is synchronous, can't await a
    // share API call, so preview always renders anonymously. Phase 3 will
    // switch this to a placeholder `<img data-bd-pending>` that the
    // webview preview-bridge script swaps to a share URL asynchronously
    // when the page's frontmatter has `bd-share: true`.
    const result = composeUrl({
      source: cleanSource,
      theme,
      sourceFormat,
      mode: 'anonymous',
      apiBase,
      bg,
    })

    if (result.kind === 'anonymous') {
      const alt = escapeHtml(firstLine(cleanSource))
      return `<img class="bd-img" src="${escapeHtml(result.url)}" alt="${alt}" data-bd-source-format="${sourceFormat}" />\n`
    }

    // over-size-cap or has-api-key — fall back to default renderer + show note
    const note = `<div class="bd-note">Diagram source exceeds ${Math.round(ANON_SOURCE_BYTE_CAP / 1024)} KB. Add an API key in <code>beautyDiagram.apiKey</code> settings to enable share rendering, or run <code>Beauty Diagram: Inject embed URLs</code> to produce a saved share URL.</div>\n`
    const fallback = defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
    return fallback + note
  }
}
