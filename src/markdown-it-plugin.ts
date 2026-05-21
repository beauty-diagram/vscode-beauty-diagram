import type MarkdownIt from 'markdown-it'
import { composeUrl } from './url-composer'
import { parseDirective } from './directives'
import { parsePageMode } from './share-mode'
import { getConfig } from './settings'
import { ANON_SOURCE_BYTE_CAP } from './constants'
import { shortHashSync } from './hash'
import type { ShareCache } from './share-cache'
import type { PageMode, SourceFormat } from './types'

/**
 * Optional context the extension activates with. When present, the fence
 * rule can satisfy share-mode renders synchronously by reading from the
 * shared cache (pre-populated by the toggle command's pre-fetch step).
 * Tests intentionally don't set this — they exercise the anonymous-only
 * path. See docs/superpowers/plans/2026-05-21-plugin-share-mode.md
 * Phase 3 for the architecture choice (spike #3.1 confirmed VS Code
 * built-in markdown preview rejects bidirectional webview messaging).
 */
interface BdShareContext {
  cache: ShareCache
  /** Lazy accessor for the current API key; mirror of the obsidian
   *  plugin's getApi() pattern to avoid stale snapshots on key rotation. */
  getApiKey: () => string
}

let context: BdShareContext | null = null

/** Called by extension.ts at activate (and on settings change) so the
 *  fence rule can do synchronous cache lookups. Safe to omit in tests. */
export function setBdShareContext(ctx: BdShareContext | null): void {
  context = ctx
}

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

function buildShareUrl(apiBase: string, token: string, bg?: 'transparent'): string {
  const base = `${apiBase}/v1/share/${token}.svg`
  return bg === 'transparent' ? `${base}?bg=transparent` : base
}

/**
 * Render the diagram as a bare <img>. We previously wrapped in a positioned
 * <span> (0.1.9) and then <div> (0.1.11) to provide a hover-revealed
 * "Open in editor" badge — both broke VS Code's preview pipeline entirely
 * (fence content disappeared from the DOM, no network request, no DOM trace).
 *
 * Root cause never fully pinned: likely interaction with VS Code's
 * markdown-it pipeline / dompurify sanitizer / built-in mermaid renderer
 * (`vscode.mermaid-markdown-features`) that's intolerant of additional
 * structure around fence output. Bare <img> is what 0.1.5–0.1.8 shipped
 * and what reliably works. CodeLens already provides an "Open in editor"
 * affordance in source mode; preview users can right-click the image and
 * use the URL directly.
 */
function renderDiagramImg(opts: {
  src: string
  alt: string
  sourceFormat: SourceFormat
  mode: PageMode
}): string {
  return (
    `<img class="bd-img" src="${escapeHtml(opts.src)}" alt="${opts.alt}" ` +
    `data-bd-source-format="${opts.sourceFormat}" data-bd-mode="${opts.mode}" />\n`
  )
}

export function bdMarkdownItPlugin(md: MarkdownIt): void {
  // Pre-parse the raw source for our `bd-share: true` front-matter marker
  // so the fence rule (synchronous, no awaits) knows whether to attempt
  // the share path. parsePageMode is the same pure module used by Obsidian.
  // The env object is propagated by markdown-it from md.parse → renderer.rules,
  // letting us communicate state across rule boundaries without globals.
  md.core.ruler.before('normalize', 'bd-share-mode', (state) => {
    ;(state.env as { bdShareMode?: PageMode }).bdShareMode = parsePageMode(state.src)
  })

  // Suppress the front-matter render when our `bd-share` marker is present.
  // VS Code (or one of the popular markdown extensions like Markdown All in One)
  // renders YAML front-matter as a visible chip / table in the preview, which
  // surfaces our internal plugin marker as if it were user-facing metadata.
  // We only hide it when bd-share is in there — other front-matter (tags,
  // title, custom user keys) renders normally.
  const defaultFrontMatter = md.renderer.rules.front_matter
  md.renderer.rules.front_matter = (tokens, idx, options, env, self) => {
    const content = tokens[idx].content
    if (/^bd-share\s*:/m.test(content)) {
      return ''
    }
    return defaultFrontMatter
      ? defaultFrontMatter(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }

  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const info = (token.info || '').trim().toLowerCase()

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

    // Empty fence (whitespace-only or no content): nothing to render, and the
    // server's POST /v1/share rejects an empty source with 400 invalid_input.
    // Mirror Obsidian's behavior — quietly skip the block (fall back to the
    // default markdown-it fence renderer, which produces an empty <pre><code>).
    if (!cleanSource.trim()) {
      return defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
    }

    const pageMode: PageMode = (env as { bdShareMode?: PageMode }).bdShareMode ?? 'anonymous'

    // share mode + extension context wired + cache hit → emit /v1/share/<token>.svg
    // share mode + cache miss → fall through to anonymous and prepend a hint
    //   (the user needs to run `Beauty Diagram: Toggle share mode` to pre-fetch
    //    tokens for this file; a fresh-open of a file that already has
    //    `bd-share: true` from git will hit this path on first preview).
    if (pageMode === 'share' && context) {
      const ownerTag = shortHashSync('owner:' + context.getApiKey())
      const cachedToken = context.cache.getSync(cleanSource, theme, sourceFormat, ownerTag)
      if (cachedToken) {
        return renderDiagramImg({
          src: buildShareUrl(apiBase, cachedToken, bg),
          alt: escapeHtml(firstLine(cleanSource)),
          sourceFormat,
          mode: 'share',
        })
      }
      // cache miss in share mode — fall through to anonymous; no hint banner
      // (the banner was also unreliable in some preview pipelines)
    }

    const result = composeUrl({
      source: cleanSource,
      theme,
      sourceFormat,
      mode: 'anonymous',
      apiBase,
      bg,
    })

    if (result.kind === 'anonymous') {
      return renderDiagramImg({
        src: result.url,
        alt: escapeHtml(firstLine(cleanSource)),
        sourceFormat,
        mode: pageMode,
      })
    }

    // over-size-cap — fall back to default renderer + show note
    const note = `<div class="bd-note">Diagram source exceeds ${Math.round(ANON_SOURCE_BYTE_CAP / 1024)} KB. Enable share mode for this page (<code>Beauty Diagram: Toggle share mode</code>) or run <code>Beauty Diagram: Inject embed URLs</code> to produce a saved share URL.</div>\n`
    const fallback = defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
    return fallback + note
  }
}
