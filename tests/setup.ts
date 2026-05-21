// Node 18 doesn't expose globalThis.crypto by default; hash.ts uses
// crypto.subtle.digest. Node 19+ has it but vitest's effective Node
// version may lag. Provide a deterministic polyfill so tests pass
// regardless of host Node version.
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) {
  // The webcrypto types from node:crypto don't exactly match the
  // browser Crypto type but the surface we use (subtle.digest) is
  // identical. Cast is safe (no DOM lib in tsconfig, so Crypto is unknown).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).crypto = webcrypto
}
