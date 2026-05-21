import { ANON_SOURCE_BYTE_CAP, DEFAULT_API_BASE } from './constants'
import type { ComposeOptions, ComposeResult } from './types'

export function composeUrl(opts: ComposeOptions): ComposeResult {
  if (opts.mode === 'share') {
    return { kind: 'needs-share', reason: 'share-mode' }
  }

  const bytes = utf8ByteLength(opts.source)
  if (bytes > ANON_SOURCE_BYTE_CAP) {
    return { kind: 'needs-share', reason: 'over-size-cap' }
  }

  const base = opts.apiBase ?? DEFAULT_API_BASE
  const encoded = base64UrlEncode(opts.source)
  let url = `${base}/v1/beautify.svg?source=${encoded}&theme=${encodeURIComponent(opts.theme)}&sourceFormat=${opts.sourceFormat}`
  if (opts.bg === 'transparent') url += '&bg=transparent'
  return { kind: 'anonymous', url }
}

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength
}

function base64UrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
