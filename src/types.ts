export type SourceFormat = 'mermaid' | 'plantuml'
export type ThemeId = string // not literal-typed; backend can add themes

export interface ComposeOptions {
  source: string
  theme: ThemeId
  sourceFormat: SourceFormat
  apiBase?: string
  hasApiKey: boolean
  bg?: 'transparent'
}

export type ComposeResult =
  | { kind: 'anonymous'; url: string }
  | { kind: 'needs-share'; reason: 'has-api-key' | 'over-size-cap' }
