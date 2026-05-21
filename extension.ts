import * as vscode from 'vscode'
import type MarkdownIt from 'markdown-it'
import { bdMarkdownItPlugin, setBdShareContext } from './src/markdown-it-plugin'
import { BdCodeLensProvider } from './src/codelens-provider'
import { registerCommands } from './src/commands'
import { createApiClient, type ApiClient } from './src/api-client'
import { ShareCache } from './src/share-cache'
import { UsageCache } from './src/usage-cache'
import { getConfig } from './src/settings'

const PLUGIN_VERSION = '0.1.0'

export function activate(context: vscode.ExtensionContext): {
  extendMarkdownIt(md: MarkdownIt): MarkdownIt
} {
  const cache = new ShareCache(context.globalState)

  // Mutable api reference — rebuilt on settings change so a key rotation
  // takes effect without reloading the window. Same shape as
  // obsidian-beauty-diagram's getApi() lazy accessor (alpha.8 fix).
  let api: ApiClient = createApiClient({
    apiBase: getConfig('apiBase'),
    apiKey: getConfig('apiKey') || null,
    version: PLUGIN_VERSION,
  })
  let usage = new UsageCache(api)

  const rebuildClients = () => {
    api = createApiClient({
      apiBase: getConfig('apiBase'),
      apiKey: getConfig('apiKey') || null,
      version: PLUGIN_VERSION,
    })
    usage = new UsageCache(api)
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('beautyDiagram')) {
        rebuildClients()
      }
    }),
  )

  // Wire the fence rule's share-mode context so it can synchronously
  // hit the share cache for diagrams whose tokens were pre-fetched by
  // the toggle command. See markdown-it-plugin.ts comment for why this
  // is a module-level singleton rather than passed through markdown-it env.
  setBdShareContext({
    cache,
    getApiKey: () => getConfig('apiKey') ?? '',
  })

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'markdown' },
      new BdCodeLensProvider(),
    ),
  )

  registerCommands(context, {
    getApi: () => api,
    getUsageCache: () => usage,
    cache,
  })

  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      return md.use(bdMarkdownItPlugin)
    },
  }
}

export function deactivate(): void {
  setBdShareContext(null)
  // VS Code disposes registered subscriptions automatically.
}
