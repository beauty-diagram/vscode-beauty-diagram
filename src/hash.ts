export async function shortHash(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('')
  return hex.slice(0, 8)
}

/**
 * Synchronous shortHash variant for the markdown-it fence rule, which
 * must produce HTML without awaiting. Uses `node:crypto` (extension host
 * is Node, never browser webview — see Phase 3.1 spike in plan), which
 * is available in VS Code's extension host process. Output matches the
 * async `shortHash` byte-for-byte so cache entries written via either
 * function are interchangeable.
 *
 * Not exposed in obsidian-beauty-diagram — Obsidian's render path is
 * async (post-processor) so it uses the awaitable variant exclusively.
 */
export function shortHashSync(input: string): string {
  // Lazy require so test environments / future browser-host builds that
  // don't ship node:crypto don't break at module load time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('node:crypto') as typeof import('node:crypto')
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 8)
}
