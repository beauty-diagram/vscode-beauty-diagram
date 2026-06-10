import type MarkdownIt from 'markdown-it'
import { composeUrl } from './url-composer'
import { parseDirective } from './directives'
import { parsePageMode } from './share-mode'
import {
  parsePageWidth,
  resolveEffectiveWidth,
  widthToInlineStyle,
} from './image-width'
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
  /** Optional `max-width: <value>;` style fragment from image-width.ts.
   *  Empty string when the effective width is `'full'` (CSS default
   *  `.bd-img { max-width: 100% }` takes over). */
  widthStyle?: string
  /** Raw (clean) diagram source for the per-block native-renderer fallback.
   *  When set (mermaid + fallbackToNativeRenderer on), the img URL gains
   *  `onfail=status` so the server answers render failures with 422 + a
   *  NON-IMAGE body (a 4xx with a valid image body still fires `load` —
   *  browsers decode <img> bodies regardless of HTTP status), and the source
   *  rides along in `data-bd-source` so preview/bd-native-fallback.js can
   *  hand the block to VS Code's built-in mermaid renderer on failure.
   *  Attributes only — fence output must stay a bare <img> (wrapper HTML
   *  broke the preview pipeline in 0.1.9–0.1.11, see comment above). */
  fallbackSource?: string
}): string {
  const style = opts.widthStyle ? ` style="${escapeHtml(opts.widthStyle)}"` : ''
  const src = opts.fallbackSource
    ? opts.src + (opts.src.includes('?') ? '&' : '?') + 'onfail=status'
    : opts.src
  const fallbackAttr = opts.fallbackSource
    ? ` data-bd-source="${escapeHtml(opts.fallbackSource)}"`
    : ''
  return (
    `<img class="bd-img" src="${escapeHtml(src)}" alt="${opts.alt}" ` +
    `data-bd-source-format="${opts.sourceFormat}" data-bd-mode="${opts.mode}"${style}${fallbackAttr} />\n`
  )
}

/**
 * Read the YAML front-matter content from the tokens array.
 *
 * Why tokens (not env / state.src): VS Code's markdown engine uses
 * separate env objects for parse and render
 * (extensions/markdown-language-features/src/markdownEngine.ts: parse
 * has its own env on line 187, render has its own on line 204).
 * Anything we write into env during parse is gone by render time.
 * Tokens, on the other hand, are the same array passed to both stages.
 *
 * Where in the token: VS Code's bundled front-matter block rule
 * (extensions/markdown-language-features/src/extensions/yamlPreamble/yamlPreamble.ts)
 * stores the raw YAML body in `token.meta.content`, not `token.content`.
 * Some third-party packages (e.g. markdown-it-front-matter) store it
 * differently (callback-only, leaving token.content empty). We probe
 * both shapes so the same plugin works in production AND in tests.
 */
interface FrontMatterMetaShape {
  content: string
}

/** Extract the raw YAML body from a single front_matter token, probing
 *  the three shapes we've seen in the wild. Returns '' if none match. */
function tokenFrontMatterText(token: { content: string; meta?: unknown }): string {
  const meta = token.meta
  if (meta && typeof meta === 'object' && typeof (meta as FrontMatterMetaShape).content === 'string') {
    return (meta as FrontMatterMetaShape).content
  }
  if (typeof meta === 'string') return meta
  return token.content || ''
}

function readFrontMatterContent(
  tokens: ReadonlyArray<{ type: string; content: string; meta?: unknown }>,
): string {
  const fm = tokens.find((t) => t.type === 'front_matter')
  return fm ? tokenFrontMatterText(fm) : ''
}

function detectPageMode(
  tokens: ReadonlyArray<{ type: string; content: string; meta?: unknown }>,
): PageMode {
  // Wrap the raw front-matter content with `---` delimiters so we can
  // reuse parsePageMode (which expects a full document-style front-matter
  // block, not just the YAML body).
  const fm = readFrontMatterContent(tokens)
  if (!fm) return 'anonymous'
  return parsePageMode(`---\n${fm}\n---\n`)
}

/**
 * Detect the `bd-width` value from the front-matter token. Returns
 * a validated string (`'full'` | `<n>px` | ...) or `null` when absent /
 * rejected by the whitelist. Caller passes the result through
 * `resolveEffectiveWidth()` to apply the cascade against the workspace
 * setting default.
 */
function detectPageWidth(
  tokens: ReadonlyArray<{ type: string; content: string; meta?: unknown }>,
): string | null {
  const fm = readFrontMatterContent(tokens)
  if (!fm) return null
  return parsePageWidth(`---\n${fm}\n---\n`)
}

export function bdMarkdownItPlugin(md: MarkdownIt): void {
  // Note: we previously tried md.renderer.rules.front_matter = () => '' to
  // hide our bd-share chip, but VS Code's bundled yamlPreamble extension
  // registers AFTER third-party extendMarkdownIt contributors (see
  // markdownEngine.ts:142-150) and unconditionally overwrites the rule.
  // The actual suppression lives in preview/hide-bd-share.js (a webview
  // previewScript) — search there if you need to change the behavior.

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

    // Read share mode from the front-matter token directly. This used to
    // come from env.bdShareMode (set in a core ruler) but VS Code uses
    // independent env objects for parse and render — env-based metadata
    // never made it to the fence rule. See readFrontMatterContent doc.
    const pageMode: PageMode = detectPageMode(tokens)

    // Resolve effective image max-width once per fence: page front-matter
    // override → workspace setting default → 'full' (no inline style).
    // Same cascade as the Obsidian plugin; whitelist validation in
    // resolveEffectiveWidth() means invalid front-matter never reaches
    // the HTML attribute.
    const pageWidth = detectPageWidth(tokens)
    const settingWidth = getConfig('defaultImageWidth')
    const effectiveWidth = resolveEffectiveWidth(pageWidth, settingWidth)
    const widthStyle = widthToInlineStyle(effectiveWidth)

    // Per-block native fallback is mermaid-only (VS Code has no built-in
    // PlantUML renderer). The actual fallback lives in
    // preview/bd-native-fallback.js; here we only opt the URL into
    // detectable failures and carry the source on the img.
    const fallbackSource =
      sourceFormat === 'mermaid' && getConfig('fallbackToNativeRenderer')
        ? cleanSource
        : undefined

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
          widthStyle,
          fallbackSource,
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
        widthStyle,
        fallbackSource,
      })
    }

    // over-size-cap — fall back to default renderer + show note
    const note = `<div class="bd-note">Diagram source exceeds ${Math.round(ANON_SOURCE_BYTE_CAP / 1024)} KB. Enable watermark-free preview (<code>Beauty Diagram: Toggle watermark-free preview for this page</code>) or run <code>Beauty Diagram: Embed share URLs into this note</code> to bake a saved share URL.</div>\n`
    const fallback = defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
    return fallback + note
  }
}
