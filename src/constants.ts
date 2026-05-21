export const DEFAULT_API_BASE = 'https://api.beauty-diagram.com'
export const ANON_SOURCE_BYTE_CAP = 5 * 1024 // 5 KB, matches CLI `bd extract` inline mode
export const FALLBACK_THEMES = [
  'classic', 'modern', 'slate', 'atlas', 'obsidian',
  'brutalist', 'atelier', 'blueprint', 'memphis',
] as const
