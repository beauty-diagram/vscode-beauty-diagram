import * as vscode from 'vscode'
import type MarkdownIt from 'markdown-it'
import { bdMarkdownItPlugin } from './src/markdown-it-plugin'
import { BdCodeLensProvider } from './src/codelens-provider'
import { registerCommands } from './src/commands'
import { createApiClient } from './src/api-client'
import { ShareCache } from './src/share-cache'
import { getConfig } from './src/settings'

const PLUGIN_VERSION = '0.1.0'

export function activate(context: vscode.ExtensionContext): {
  extendMarkdownIt(md: MarkdownIt): MarkdownIt
} {
  console.log('[bd] activate() called — VS Code extension loaded')
  const cache = new ShareCache(context.globalState)
  const api = createApiClient({
    apiBase: getConfig('apiBase'),
    apiKey: getConfig('apiKey') || null,
    version: PLUGIN_VERSION,
  })

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'markdown' },
      new BdCodeLensProvider(),
    ),
  )

  registerCommands(context, api, cache)

  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      console.log('[bd] extendMarkdownIt called — applying plugin')
      return md.use(bdMarkdownItPlugin)
    },
  }
}

export function deactivate(): void {
  // VS Code disposes registered subscriptions automatically.
}
