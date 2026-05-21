export type SourceFormat = 'mermaid' | 'plantuml'
export type ThemeId = string // not literal-typed; backend can add themes

/**
 * Per-page render mode. Driven by the document's YAML front-matter
 * `bd-share: true` marker (see share-mode.ts). `share` is an explicit
 * opt-in that consumes share quota; default is `anonymous` (free,
 * always watermarked via /v1/beautify.svg).
 */
export type PageMode = 'anonymous' | 'share'

export interface ComposeOptions {
  source: string
  theme: ThemeId
  sourceFormat: SourceFormat
  /**
   * Explicit render mode. The caller decides — `composeUrl` no longer
   * infers from "has API key" (which silently consumed export quota).
   * See docs/superpowers/specs/2026-05-21-plugin-share-mode-design.md
   * in the monorepo for the business contract behind this split.
   */
  mode: PageMode
  apiBase?: string
  bg?: 'transparent'
}

export type ComposeResult =
  | { kind: 'anonymous'; url: string }
  | { kind: 'needs-share'; reason: 'share-mode' | 'over-size-cap' }
