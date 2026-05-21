import * as vscode from 'vscode'
import { injectEmbeds, cleanEmbeds } from './injection'
import { getConfig } from './settings'
import { editorLink } from './editor-link'
import { ShareCache } from './share-cache'
import { ApiClient, ApiError } from './api-client'
import type { SourceFormat } from './types'
import type { OpenInEditorArgs } from './codelens-provider'

export function registerCommands(
  context: vscode.ExtensionContext,
  api: ApiClient,
  cache: ShareCache,
): void {
  const makeShareIdResolver = () =>
    async (src: string, theme: string, sourceFormat: SourceFormat): Promise<string | null> => {
      const cached = await cache.get(src, theme, sourceFormat)
      if (cached) return cached
      if (!getConfig('apiKey')) return null
      try {
        const share = await api.createShare({ source: src, theme, sourceFormat })
        await cache.set(src, theme, sourceFormat, share.shareToken)
        return share.shareToken
      } catch {
        return null
      }
    }

  context.subscriptions.push(
    vscode.commands.registerCommand('beautyDiagram.injectCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('Beauty Diagram: open a Markdown file first.')
        return
      }
      const original = editor.document.getText()
      const updated = await injectEmbeds(original, {
        theme: getConfig('defaultTheme'),
        hasApiKey: !!getConfig('apiKey'),
        apiBase: getConfig('apiBase'),
        shareIdForSource: makeShareIdResolver(),
      })
      if (updated === original) {
        vscode.window.showInformationMessage('Beauty Diagram: no changes needed.')
        return
      }
      await editor.edit((edit) => {
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(original.length),
        )
        edit.replace(fullRange, updated)
      })
      vscode.window.showInformationMessage('Beauty Diagram: injection done.')
    }),

    vscode.commands.registerCommand('beautyDiagram.injectWorkspace', async () => {
      const files = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**')
      if (files.length === 0) {
        vscode.window.showInformationMessage('Beauty Diagram: no .md files found in workspace.')
        return
      }
      const choice = await vscode.window.showInformationMessage(
        `Inject embed URLs in ${files.length} Markdown files?`,
        { modal: true }, 'Run', 'Cancel',
      )
      if (choice !== 'Run') return

      let touched = 0
      const resolver = makeShareIdResolver()
      for (const uri of files) {
        const bytes = await vscode.workspace.fs.readFile(uri)
        const original = new TextDecoder().decode(bytes)
        const updated = await injectEmbeds(original, {
          theme: getConfig('defaultTheme'),
          hasApiKey: !!getConfig('apiKey'),
          apiBase: getConfig('apiBase'),
          shareIdForSource: resolver,
        })
        if (updated !== original) {
          await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(updated))
          touched++
        }
      }
      vscode.window.showInformationMessage(`Beauty Diagram: injected in ${touched} / ${files.length} files.`)
    }),

    vscode.commands.registerCommand('beautyDiagram.cleanWorkspace', async () => {
      const files = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**')
      if (files.length === 0) {
        vscode.window.showInformationMessage('Beauty Diagram: no .md files found in workspace.')
        return
      }
      const choice = await vscode.window.showInformationMessage(
        `Clean orphan embed URLs in ${files.length} Markdown files?`,
        { modal: true }, 'Run', 'Cancel',
      )
      if (choice !== 'Run') return

      let touched = 0
      for (const uri of files) {
        const bytes = await vscode.workspace.fs.readFile(uri)
        const original = new TextDecoder().decode(bytes)
        const cleaned = await cleanEmbeds(original)
        if (cleaned !== original) {
          await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(cleaned))
          touched++
        }
      }
      vscode.window.showInformationMessage(`Beauty Diagram: cleaned ${touched} files.`)
    }),

    vscode.commands.registerCommand('beautyDiagram.verifyApiKey', async () => {
      try {
        await api.getUsage()
        vscode.window.showInformationMessage('Beauty Diagram: API key verified.')
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err)
        vscode.window.showErrorMessage(`Beauty Diagram: Key verification failed (${msg})`)
      }
    }),

    vscode.commands.registerCommand('beautyDiagram.openInEditor', (args: OpenInEditorArgs) => {
      const url = editorLink({ source: args.source, theme: args.theme, sourceFormat: args.sourceFormat })
      vscode.env.openExternal(vscode.Uri.parse(url))
    }),
  )
}
