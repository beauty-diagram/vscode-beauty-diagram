import type { SourceFormat } from './types'

export interface DirectiveOverrides {
  theme?: string
  bg?: string
  [key: string]: string | undefined
}

export interface DirectiveResult {
  overrides: DirectiveOverrides
  source: string
}

const COMMENT_PREFIX: Record<SourceFormat, string> = {
  mermaid: '%%',
  plantuml: "'",
}

// Matches the comment-prefix, optional whitespace, bd:key[=value], trailing
// whitespace. The value is optional — bare boolean directives like
// `%% bd:exclude` parse with value 'true'. The prefix is substituted at
// call-time.
function makePattern(prefix: string): RegExp {
  // Escape the prefix for use in regex (e.g. `'` is not special but `%%` is not either)
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}\\s*bd:(\\w+)(?:=([\\w-]+))?\\s*$`)
}

/** Whether the block opted out of Beauty Diagram rendering entirely
 *  (`bd:exclude` / `bd:exclude=true`). Excluded blocks render via the host's
 *  native pipeline and are skipped by embed injection. */
export function isExcluded(overrides: DirectiveOverrides): boolean {
  return overrides.exclude !== undefined && overrides.exclude !== 'false'
}

export function parseDirective(sourceFormat: SourceFormat, source: string): DirectiveResult {
  const prefix = COMMENT_PREFIX[sourceFormat]
  const pattern = makePattern(prefix)
  const overrides: DirectiveOverrides = {}

  let remaining = source

  while (true) {
    const newlineIdx = remaining.indexOf('\n')
    const firstLine = newlineIdx === -1 ? remaining : remaining.slice(0, newlineIdx)
    const rest = newlineIdx === -1 ? '' : remaining.slice(newlineIdx + 1)

    // Blank line between directives: skip and keep parsing
    if (firstLine.trim() === '') {
      if (newlineIdx === -1) {
        // Only blank left — stop
        break
      }
      remaining = rest
      continue
    }

    const match = firstLine.match(pattern)
    if (!match) {
      // First non-blank, non-directive line — stop
      break
    }

    const key = match[1]
    // Valueless form (`bd:exclude`) parses as boolean true.
    const value = match[2] ?? 'true'
    overrides[key] = value

    if (newlineIdx === -1) {
      remaining = ''
      break
    }
    remaining = rest
  }

  return { overrides, source: remaining }
}
