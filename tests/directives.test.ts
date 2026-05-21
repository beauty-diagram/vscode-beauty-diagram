import { describe, it, expect } from 'vitest'
import { parseDirective } from '../src/directives'

describe('parseDirective', () => {
  it('extracts mermaid theme directive', () => {
    const r = parseDirective('mermaid', '%% bd:theme=classic\nflowchart LR\n  A --> B')
    expect(r).toEqual({
      overrides: { theme: 'classic' },
      source: 'flowchart LR\n  A --> B',
    })
  })

  it('extracts plantuml theme directive', () => {
    const r = parseDirective('plantuml', "' bd:theme=classic\n@startuml\nA --> B\n@enduml")
    expect(r).toEqual({
      overrides: { theme: 'classic' },
      source: '@startuml\nA --> B\n@enduml',
    })
  })

  it('returns empty overrides when no directive', () => {
    const r = parseDirective('mermaid', 'flowchart LR\n  A --> B')
    expect(r).toEqual({
      overrides: {},
      source: 'flowchart LR\n  A --> B',
    })
  })

  it('ignores wrong comment style', () => {
    const r = parseDirective('mermaid', "' bd:theme=classic\nflowchart LR")
    expect(r.overrides).toEqual({})
    expect(r.source).toBe("' bd:theme=classic\nflowchart LR")
  })

  it('ignores directive not on first line', () => {
    const r = parseDirective('mermaid', 'flowchart LR\n%% bd:theme=classic')
    expect(r.overrides).toEqual({})
  })

  it('tolerates whitespace around directive', () => {
    const r = parseDirective('mermaid', '%%   bd:theme=classic   \nflowchart LR')
    expect(r.overrides.theme).toBe('classic')
    expect(r.source).toBe('flowchart LR')
  })

  it('rejects invalid theme names (lets backend decide)', () => {
    // Theme value is passed through; backend validates. We only enforce regex shape.
    const r = parseDirective('mermaid', '%% bd:theme=foo-bar\nflowchart LR')
    expect(r.overrides.theme).toBe('foo-bar')
  })

  // --- 4 new tests ---

  it('parses multi-line theme + bg directives', () => {
    const r = parseDirective(
      'mermaid',
      '%% bd:theme=classic\n%% bd:bg=transparent\nflowchart LR\n  A --> B',
    )
    expect(r.overrides).toEqual({ theme: 'classic', bg: 'transparent' })
    expect(r.source).toBe('flowchart LR\n  A --> B')
  })

  it('tolerates blank line between two directives', () => {
    const r = parseDirective(
      'mermaid',
      '%% bd:theme=classic\n\n%% bd:bg=transparent\nflowchart LR',
    )
    expect(r.overrides).toEqual({ theme: 'classic', bg: 'transparent' })
    expect(r.source).toBe('flowchart LR')
  })

  it('stops parsing at first non-directive non-blank line', () => {
    const r = parseDirective(
      'mermaid',
      '%% bd:theme=classic\nflowchart LR\n%% bd:bg=transparent',
    )
    expect(r.overrides).toEqual({ theme: 'classic' })
    expect(r.source).toBe('flowchart LR\n%% bd:bg=transparent')
  })

  it('stores unknown keys without erroring (forward-compat)', () => {
    const r = parseDirective('mermaid', '%% bd:future=x\nflowchart LR')
    // Must not throw, key is stored, source is stripped
    expect(r.overrides).toHaveProperty('future', 'x')
    expect(r.source).toBe('flowchart LR')
  })
})
