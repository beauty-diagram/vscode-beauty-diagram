import { describe, it, expect, vi } from 'vitest'
import { BdCodeLensProvider } from '../src/codelens-provider'
import * as vscode from 'vscode'
import { FakeTextDocument } from './mocks/vscode'

function setConfig(overrides: Record<string, unknown> = {}) {
  vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
    get: <T>(key: string, dflt?: T): T | undefined => {
      if (key in overrides) return overrides[key] as T
      return dflt
    },
    update: vi.fn(),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>)
}

describe('BdCodeLensProvider', () => {
  it('emits one CodeLens per mermaid fence', () => {
    setConfig({ defaultTheme: 'classic' })
    const provider = new BdCodeLensProvider()
    const doc = new FakeTextDocument(
      '# Title\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nMore text.\n\n```mermaid\nflowchart TD\n  X --> Y\n```\n',
    )
    const lenses = provider.provideCodeLenses(doc) as { command: { title: string; arguments: unknown[] } }[]
    expect(lenses).toHaveLength(2)
    expect(lenses[0].command.title).toBe('↗ Open in Beauty Diagram editor')
    expect((lenses[0].command.arguments![0] as { sourceFormat: string }).sourceFormat).toBe('mermaid')
  })

  it('emits CodeLens for plantuml fences', () => {
    setConfig({ defaultTheme: 'classic' })
    const provider = new BdCodeLensProvider()
    const doc = new FakeTextDocument('```plantuml\n@startuml\nA -> B\n@enduml\n```')
    const lenses = provider.provideCodeLenses(doc) as { command: { arguments: unknown[] } }[]
    expect(lenses).toHaveLength(1)
    expect((lenses[0].command.arguments![0] as { sourceFormat: string }).sourceFormat).toBe('plantuml')
  })

  it('strips bd:theme directive from source before passing to command', () => {
    setConfig({ defaultTheme: 'classic' })
    const provider = new BdCodeLensProvider()
    const doc = new FakeTextDocument(
      '```mermaid\n%% bd:theme=memphis\nflowchart LR\n  A --> B\n```',
    )
    const lenses = provider.provideCodeLenses(doc) as { command: { arguments: unknown[] } }[]
    const args = lenses[0].command.arguments![0] as { source: string; theme: string }
    expect(args.theme).toBe('memphis')
    expect(args.source).toBe('flowchart LR\n  A --> B')
  })

  it('returns no lenses for non-mermaid/plantuml fences', () => {
    setConfig({ defaultTheme: 'classic' })
    const provider = new BdCodeLensProvider()
    const doc = new FakeTextDocument('```bash\necho hi\n```')
    const lenses = provider.provideCodeLenses(doc)
    expect(lenses).toHaveLength(0)
  })

  it('skips unclosed fence', () => {
    setConfig({ defaultTheme: 'classic' })
    const provider = new BdCodeLensProvider()
    const doc = new FakeTextDocument('```mermaid\nflowchart LR\n  A --> B\n')
    const lenses = provider.provideCodeLenses(doc)
    expect(lenses).toHaveLength(0)
  })

  it('uses defaultTheme setting when no directive', () => {
    setConfig({ defaultTheme: 'modern' })
    const provider = new BdCodeLensProvider()
    const doc = new FakeTextDocument('```mermaid\nflowchart LR\n  A --> B\n```')
    const lenses = provider.provideCodeLenses(doc) as { command: { arguments: unknown[] } }[]
    expect((lenses[0].command.arguments![0] as { theme: string }).theme).toBe('modern')
  })
})
