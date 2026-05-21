import * as vscode from 'vscode'
import MarkdownIt from 'markdown-it'
import { injectEmbeds, cleanEmbeds } from './injection'
import { parsePageMode, setPageShareMode } from './share-mode'
import { parseDirective } from './directives'
import { getConfig } from './settings'
import { editorLink } from './editor-link'
import { ShareCache } from './share-cache'
import { ApiClient, ApiError } from './api-client'
import { UsageCache } from './usage-cache'
import { shortHash } from './hash'
import type { SourceFormat } from './types'
import type { OpenInEditorArgs } from './codelens-provider'

/**
 * Lazy accessors — see extension.ts. We never capture an ApiClient or
 * UsageCache snapshot here because saveSettings replaces them on key /
 * apiBase change; capturing would silently call /v1/share with stale
 * credentials. Same trap fixed in obsidian-beauty-diagram alpha.8.
 */
export interface CommandDeps {
  getApi: () => ApiClient
  getUsageCache: () => UsageCache
  cache: ShareCache
}

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  const makeShareIdResolver = () => {
    const apiKey = getConfig('apiKey') || ''
    return async (src: string, theme: string, sourceFormat: SourceFormat): Promise<string | null> => {
      const ownerTag = await shortHash('owner:' + apiKey)
      const cached = await deps.cache.get(src, theme, sourceFormat, ownerTag)
      if (cached) return cached
      if (!apiKey) return null
      try {
        const share = await deps.getApi().createShare({ source: src, theme, sourceFormat })
        await deps.cache.set(src, theme, sourceFormat, share.shareToken, ownerTag)
        return share.shareToken
      } catch {
        return null
      }
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
        const usage = await deps.getApi().getUsage()
        // A successful auth confirms plan tier — invalidate any stale
        // cached plan so the next toggle command doesn't fire on outdated data.
        deps.getUsageCache().invalidate()
        const plan = usage.plan
        const q = usage.exports
        const quotaText = q
          ? q.limit == null
            ? ` · ${q.used} share renders this month (unlimited)`
            : ` · ${q.used}/${q.limit} share quota used this month`
          : ''
        vscode.window.showInformationMessage(`Beauty Diagram: verified. Plan: ${plan}${quotaText}`)
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err)
        vscode.window.showErrorMessage(`Beauty Diagram: Key verification failed (${msg})`)
      }
    }),

    vscode.commands.registerCommand('beautyDiagram.toggleShareMode', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('Beauty Diagram: open a Markdown file first.')
        return
      }

      const apiKey = getConfig('apiKey') || ''
      if (!apiKey) {
        vscode.window.showInformationMessage(
          'Set your Beauty Diagram API key in settings (beautyDiagram.apiKey) first, then run this command. ' +
            'Share mode requires an authenticated key to call /v1/share.',
        )
        return
      }

      const plan = await deps.getUsageCache().getPlan()
      if (plan === 'free') {
        const choice = await vscode.window.showInformationMessage(
          'Share mode requires a Pro plan. Free users still get unlimited anonymous preview (watermarked).',
          'Open pricing',
          'Cancel',
        )
        if (choice === 'Open pricing') {
          vscode.env.openExternal(vscode.Uri.parse('https://www.beauty-diagram.com/pricing'))
        }
        return
      }
      if (plan === 'unknown') {
        vscode.window.showInformationMessage(
          "Couldn't verify your plan. Run \"Beauty Diagram: Verify API key\" first, then try again.",
        )
        return
      }

      const original = editor.document.getText()
      const current = parsePageMode(original)
      const next = current === 'share' ? 'anonymous' : 'share'
      const updated = setPageShareMode(original, next)

      if (next === 'share') {
        // Pre-fetch share tokens for every mermaid/plantuml fence in the
        // current document. Fence rule is synchronous — without pre-fetched
        // tokens, the next preview render would fall back to anonymous +
        // hint. Doing the pre-fetch here is the maintainer-blessed shape
        // (see Phase 3.1 spike: built-in markdown preview rejects async
        // messaging from webview scripts; async work belongs in the host).
        const result = await preFetchShareTokens(deps, original)
        if (result.kind === 'error') {
          vscode.window.showErrorMessage(`Beauty Diagram: share-mode pre-fetch failed (${result.message})`)
          return
        }
        await applyEdit(editor, original, updated)
        await refreshActivePreview()
        vscode.window.showInformationMessage(
          `Beauty Diagram: share mode enabled. ${result.fetched} new diagram(s) cached` +
            (result.reused > 0 ? ` (${result.reused} already in cache)` : '') +
            '. First preview consumes 1 share quota per unique diagram.',
        )
      } else {
        await applyEdit(editor, original, updated)
        await refreshActivePreview()
        vscode.window.showInformationMessage(
          'Beauty Diagram: share mode disabled. This page renders anonymously (watermark).',
        )
      }
    }),

    vscode.commands.registerCommand('beautyDiagram.openInEditor', (args: OpenInEditorArgs) => {
      const url = editorLink({ source: args.source, theme: args.theme, sourceFormat: args.sourceFormat })
      vscode.env.openExternal(vscode.Uri.parse(url))
    }),
  )
}

async function applyEdit(
  editor: vscode.TextEditor,
  original: string,
  updated: string,
): Promise<void> {
  if (updated === original) return
  await editor.edit((edit) => {
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(original.length),
    )
    edit.replace(fullRange, updated)
  })
}

async function refreshActivePreview(): Promise<void> {
  // Built-in markdown preview command — re-runs the markdown-it pipeline
  // so the fence rule observes the freshly written frontmatter + cache.
  // If no preview is open, the command is a no-op.
  try {
    await vscode.commands.executeCommand('markdown.preview.refresh')
  } catch {
    // ignore — refresh is best-effort, user can manually re-open preview
  }
}

interface PreFetchOk {
  kind: 'ok'
  fetched: number
  reused: number
}
interface PreFetchError {
  kind: 'error'
  message: string
}
type PreFetchResult = PreFetchOk | PreFetchError

/**
 * Walk every mermaid/plantuml fence in the document, mint a share token
 * for each (or reuse a cached one), and write to ShareCache so the fence
 * rule can find it synchronously on the next render. Stops on first
 * server error so we don't burn quota mid-failure.
 */
async function preFetchShareTokens(
  deps: CommandDeps,
  document: string,
): Promise<PreFetchResult> {
  const apiKey = getConfig('apiKey') || ''
  const defaultTheme = getConfig('defaultTheme') as string
  const ownerTag = await shortHash('owner:' + apiKey)

  // Parse with the same markdown-it the preview uses so we see exactly
  // the same fence token.content as fence rule will see at render time.
  const md = new MarkdownIt()
  const tokens = md.parse(document, {})

  let fetched = 0
  let reused = 0

  for (const tok of tokens) {
    if (tok.type !== 'fence') continue
    const info = (tok.info || '').trim().toLowerCase()
    if (info !== 'mermaid' && info !== 'plantuml') continue
    const sourceFormat = info as SourceFormat
    const { overrides, source: cleanSource } = parseDirective(sourceFormat, tok.content)
    const theme = overrides.theme ?? defaultTheme

    const cached = await deps.cache.get(cleanSource, theme, sourceFormat, ownerTag)
    if (cached) {
      reused++
      continue
    }

    try {
      const share = await deps.getApi().createShare({
        source: cleanSource,
        theme,
        sourceFormat,
      })
      await deps.cache.set(cleanSource, theme, sourceFormat, share.shareToken, ownerTag)
      fetched++
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err)
      return { kind: 'error', message: msg }
    }
  }

  return { kind: 'ok', fetched, reused }
}
