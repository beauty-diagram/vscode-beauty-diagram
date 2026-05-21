import * as vscode from 'vscode'
import { parseDirective } from './directives'
import { getConfig } from './settings'
import type { SourceFormat } from './types'

const OPEN_FENCE = /^```(mermaid|plantuml)\s*$/

export interface OpenInEditorArgs {
  source: string
  sourceFormat: SourceFormat
  theme: string
}

/** Minimal document surface used by this provider (satisfied by both the real
 *  vscode.TextDocument and the FakeTextDocument test stub). */
interface MinimalDocument {
  getText(): string
}

export class BdCodeLensProvider implements vscode.CodeLensProvider {
  private emitter = new vscode.EventEmitter<void>()
  onDidChangeCodeLenses = this.emitter.event

  provideCodeLenses(document: MinimalDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = []
    const lines = document.getText().split('\n')
    let i = 0
    while (i < lines.length) {
      const m = lines[i].match(OPEN_FENCE)
      if (!m) {
        i++
        continue
      }
      const sourceFormat = m[1] as SourceFormat
      const fenceStart = i
      let j = i + 1
      while (j < lines.length && !lines[j].startsWith('```')) j++
      if (j >= lines.length) {
        break
      }
      const fenceContent = lines.slice(i + 1, j).join('\n')
      const { overrides, source: cleanSource } = parseDirective(sourceFormat, fenceContent)
      const theme = overrides.theme ?? getConfig('defaultTheme')

      const range = new vscode.Range(fenceStart, 0, fenceStart, 0)
      const args: OpenInEditorArgs = { source: cleanSource, sourceFormat, theme }
      lenses.push(
        new vscode.CodeLens(range, {
          title: '↗ Open in Beauty Diagram editor',
          command: 'beautyDiagram.openInEditor',
          arguments: [args],
        }),
      )
      i = j + 1
    }
    return lenses
  }

  refresh(): void {
    this.emitter.fire()
  }
}
