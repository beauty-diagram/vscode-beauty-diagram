import { describe, it, expect } from 'vitest'
import { parsePageMode, setPageShareMode } from '../src/share-mode'

describe('parsePageMode', () => {
  it('returns anonymous for doc without front-matter', () => {
    expect(parsePageMode('# Hello\n\nflowchart LR\n  A --> B')).toBe('anonymous')
  })

  it('returns anonymous for empty front-matter', () => {
    expect(parsePageMode('---\n---\n\n# Hello')).toBe('anonymous')
  })

  it('returns share for bd-share: true', () => {
    expect(parsePageMode('---\nbd-share: true\n---\n\n# Hello')).toBe('share')
  })

  it('returns share when other keys come before bd-share', () => {
    expect(parsePageMode('---\ntags:\n  - notes\nbd-share: true\n---\n\nbody')).toBe('share')
  })

  it('returns share when other keys come after bd-share', () => {
    expect(parsePageMode('---\nbd-share: true\ntags:\n  - notes\n---\n\nbody')).toBe('share')
  })

  it('returns anonymous for bd-share: false', () => {
    expect(parsePageMode('---\nbd-share: false\n---\n\nbody')).toBe('anonymous')
  })

  it('returns anonymous for bd-share with string "true"', () => {
    expect(parsePageMode('---\nbd-share: "true"\n---\n\nbody')).toBe('anonymous')
  })

  it('returns anonymous for bd-share with single-quoted true', () => {
    expect(parsePageMode("---\nbd-share: 'true'\n---\n\nbody")).toBe('anonymous')
  })

  it('returns anonymous for bd-share: [true] (array)', () => {
    expect(parsePageMode('---\nbd-share:\n  - true\n---\n\nbody')).toBe('anonymous')
  })

  it('returns anonymous for bd-share: True (capitalized)', () => {
    expect(parsePageMode('---\nbd-share: True\n---\n\nbody')).toBe('anonymous')
  })

  it('returns anonymous when bd-share is missing entirely', () => {
    expect(parsePageMode('---\ntags:\n  - notes\n---\n\nbody')).toBe('anonymous')
  })

  it('handles CRLF line endings', () => {
    expect(parsePageMode('---\r\nbd-share: true\r\n---\r\n\r\nbody')).toBe('share')
  })

  it('tolerates trailing whitespace and inline comments after the value', () => {
    expect(parsePageMode('---\nbd-share: true   # share mode on\n---\n\nbody')).toBe('share')
  })

  it('returns anonymous when front-matter block is malformed (no closing ---)', () => {
    expect(parsePageMode('---\nbd-share: true\n\n# Hello')).toBe('anonymous')
  })

  it('ignores bd-share appearing in document body (not front-matter)', () => {
    expect(parsePageMode('# Title\n\nbd-share: true\n\nbody')).toBe('anonymous')
  })

  it('returns anonymous when bd-share value is missing (just key + colon)', () => {
    expect(parsePageMode('---\nbd-share:\n---\n\nbody')).toBe('anonymous')
  })
})

describe('setPageShareMode', () => {
  describe("mode 'share' (turning on)", () => {
    it('creates a fresh front-matter block on an empty document', () => {
      const doc = ''
      const out = setPageShareMode(doc, 'share')
      expect(out).toBe(
        '---\n' +
          '# Beauty Diagram: share-mode (watermark-free preview, consumes share quota per unique diagram).\n' +
          'bd-share: true\n' +
          '---\n',
      )
    })

    it('creates a fresh front-matter block on a body-only document', () => {
      const doc = '# Hello\n\nbody'
      const out = setPageShareMode(doc, 'share')
      expect(out).toBe(
        '---\n' +
          '# Beauty Diagram: share-mode (watermark-free preview, consumes share quota per unique diagram).\n' +
          'bd-share: true\n' +
          '---\n' +
          '# Hello\n\nbody',
      )
    })

    it('appends marker + comment to existing front-matter, preserving other keys and order', () => {
      const doc = '---\ntags:\n  - notes\ntitle: Foo\n---\n\nbody'
      const out = setPageShareMode(doc, 'share')
      expect(out).toBe(
        '---\n' +
          'tags:\n  - notes\n' +
          'title: Foo\n' +
          '# Beauty Diagram: share-mode (watermark-free preview, consumes share quota per unique diagram).\n' +
          'bd-share: true\n' +
          '---\n\nbody',
      )
    })

    it('is idempotent — running twice produces the same result', () => {
      const doc = '# Hello\n\nbody'
      const once = setPageShareMode(doc, 'share')
      const twice = setPageShareMode(once, 'share')
      expect(twice).toBe(once)
    })

    it('upgrades bd-share: false to true (without leaving a stray false line)', () => {
      const doc = '---\nbd-share: false\n---\n\nbody'
      const out = setPageShareMode(doc, 'share')
      expect(parsePageMode(out)).toBe('share')
      expect(out).not.toMatch(/bd-share:\s*false/)
    })
  })

  describe("mode 'anonymous' (turning off)", () => {
    it('removes marker and Beauty Diagram comment line from a single-key front-matter', () => {
      const doc =
        '---\n' +
        '# Beauty Diagram: share-mode (watermark-free preview, consumes share quota per unique diagram).\n' +
        'bd-share: true\n' +
        '---\n\nbody'
      const out = setPageShareMode(doc, 'anonymous')
      // Single-key front-matter collapses — no empty --- --- block left
      expect(out).toBe('body')
    })

    it('removes only bd-share key, preserving other front-matter keys', () => {
      const doc =
        '---\n' +
        'tags:\n  - notes\n' +
        '# Beauty Diagram: share-mode (watermark-free preview, consumes share quota per unique diagram).\n' +
        'bd-share: true\n' +
        'title: Foo\n' +
        '---\n\nbody'
      const out = setPageShareMode(doc, 'anonymous')
      expect(out).toBe(
        '---\n' +
          'tags:\n  - notes\n' +
          'title: Foo\n' +
          '---\n\nbody',
      )
    })

    it('is tolerant — removes key even if Beauty Diagram comment was hand-deleted', () => {
      const doc = '---\nbd-share: true\ntitle: Foo\n---\n\nbody'
      const out = setPageShareMode(doc, 'anonymous')
      expect(out).toBe('---\ntitle: Foo\n---\n\nbody')
    })

    it('is a no-op on a doc without bd-share', () => {
      const doc = '---\ntags:\n  - notes\n---\n\nbody'
      expect(setPageShareMode(doc, 'anonymous')).toBe(doc)
    })

    it('is a no-op on a doc without front-matter', () => {
      const doc = '# Hello\n\nbody'
      expect(setPageShareMode(doc, 'anonymous')).toBe(doc)
    })

    it('is idempotent — running twice produces the same result', () => {
      const doc = '---\nbd-share: true\n---\n\nbody'
      const once = setPageShareMode(doc, 'anonymous')
      const twice = setPageShareMode(once, 'anonymous')
      expect(twice).toBe(once)
    })
  })

  describe('round-trip', () => {
    it('on then off returns to original (modulo front-matter normalization)', () => {
      const doc = '# Hello\n\nbody'
      const onAgain = setPageShareMode(setPageShareMode(doc, 'share'), 'anonymous')
      expect(onAgain).toBe(doc)
    })

    it('off then on equals direct on', () => {
      const doc = '# Hello\n\nbody'
      const direct = setPageShareMode(doc, 'share')
      const offThenOn = setPageShareMode(setPageShareMode(doc, 'anonymous'), 'share')
      expect(offThenOn).toBe(direct)
    })

    it('preserves other keys through a full on→off cycle', () => {
      const doc = '---\ntags:\n  - notes\ntitle: Foo\n---\n\nbody'
      const onAgain = setPageShareMode(setPageShareMode(doc, 'share'), 'anonymous')
      expect(onAgain).toBe(doc)
    })
  })
})
