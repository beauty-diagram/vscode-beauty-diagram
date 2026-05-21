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
 * Resolve the markdown document the user is currently working on, even when
 * focus is on the markdown preview pane (a webview, not a TextEditor).
 * Fallback chain:
 *   1. activeTextEditor — direct case
 *   2. visibleTextEditors — preview focused but source still open in another column
 *   3. active tab input — preview-only case, surface the linked source URI
 * Returns null when there's truly no markdown context (e.g. focus on a
 * settings tab and no markdown open anywhere).
 */
async function findActiveMarkdownDocument(): Promise<vscode.TextDocument | null> {
  const active = vscode.window.activeTextEditor
  if (active && active.document.languageId === 'markdown') return active.document

  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.languageId === 'markdown') return editor.document
  }

  const tab = vscode.window.tabGroups.activeTabGroup?.activeTab
  // TabInputText / TabInputCustom / TabInputWebview all expose either `uri`
  // or a notebook/diff-shaped input. We try the simplest probe first.
  const input = tab?.input as { uri?: vscode.Uri } | undefined
  if (input?.uri) {
    try {
      const doc = await vscode.workspace.openTextDocument(input.uri)
      if (doc.languageId === 'markdown') return doc
    } catch {
      // fall through
    }
  }
  return null
}

/**
 * Replace the entire document text via WorkspaceEdit so callers don't need an
 * active editor (works while focus is on the preview pane).
 */
async function replaceEntireDocument(doc: vscode.TextDocument, updated: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit()
  edit.replace(
    doc.uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    updated,
  )
  await vscode.workspace.applyEdit(edit)
  // Persist immediately so other tools (preview refresh, git, etc) see the
  // change without requiring the user to Cmd+S after every toggle.
  if (doc.isDirty) await doc.save()
}

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
      const doc = await findActiveMarkdownDocument()
      if (!doc) {
        vscode.window.showWarningMessage('Beauty Diagram: open a Markdown file first.')
        return
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Beauty Diagram: Injecting embed URLs',
          cancellable: true,
        },
        async (progress, cancel) => {
          const original = doc.getText()
          // Inject is a single async op spanning many fences — we can't
          // easily increment per fence without forking the injection module,
          // so we show indeterminate progress with a meaningful subtitle.
          progress.report({ message: doc.uri.path.split('/').pop() ?? 'current file' })
          const updated = await injectEmbeds(original, {
            theme: getConfig('defaultTheme'),
            hasApiKey: !!getConfig('apiKey'),
            apiBase: getConfig('apiBase'),
            shareIdForSource: makeCancellableResolver(makeShareIdResolver(), cancel),
          })
          if (cancel.isCancellationRequested) {
            vscode.window.showInformationMessage('Beauty Diagram: injection cancelled.')
            return
          }
          if (updated === original) {
            vscode.window.showInformationMessage('Beauty Diagram: no changes needed.')
            return
          }
          await replaceEntireDocument(doc, updated)
          vscode.window.showInformationMessage('Beauty Diagram: injection done.')
        },
      )
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

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Beauty Diagram: Injecting embed URLs in workspace',
          cancellable: true,
        },
        async (progress, cancel) => {
          let touched = 0
          const resolver = makeCancellableResolver(makeShareIdResolver(), cancel)
          const step = 100 / files.length
          for (let i = 0; i < files.length; i++) {
            if (cancel.isCancellationRequested) break
            const uri = files[i]
            const rel = vscode.workspace.asRelativePath(uri)
            progress.report({ message: `${i + 1} / ${files.length} · ${rel}`, increment: step })
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
          const verb = cancel.isCancellationRequested ? 'partially injected' : 'injected'
          vscode.window.showInformationMessage(
            `Beauty Diagram: ${verb} in ${touched} / ${files.length} files.`,
          )
        },
      )
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

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Beauty Diagram: Cleaning orphan embed URLs',
          cancellable: true,
        },
        async (progress, cancel) => {
          let touched = 0
          const step = 100 / files.length
          for (let i = 0; i < files.length; i++) {
            if (cancel.isCancellationRequested) break
            const uri = files[i]
            const rel = vscode.workspace.asRelativePath(uri)
            progress.report({ message: `${i + 1} / ${files.length} · ${rel}`, increment: step })
            const bytes = await vscode.workspace.fs.readFile(uri)
            const original = new TextDecoder().decode(bytes)
            const cleaned = await cleanEmbeds(original)
            if (cleaned !== original) {
              await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(cleaned))
              touched++
            }
          }
          const verb = cancel.isCancellationRequested ? 'partially cleaned' : 'cleaned'
          vscode.window.showInformationMessage(`Beauty Diagram: ${verb} ${touched} files.`)
        },
      )
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
      const doc = await findActiveMarkdownDocument()
      if (!doc) {
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

      const original = doc.getText()
      const current = parsePageMode(original)
      const next = current === 'share' ? 'anonymous' : 'share'
      const updated = setPageShareMode(original, next)

      if (next === 'share') {
        const result = await vscode.window.withProgress<PreFetchResult>(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Beauty Diagram: Pre-fetching share URLs',
            cancellable: true,
          },
          (progress, cancel) => preFetchShareTokens(deps, original, progress, cancel),
        )
        if (result.kind === 'cancelled') {
          vscode.window.showInformationMessage(
            `Beauty Diagram: pre-fetch cancelled (${result.fetched} cached, ${result.reused} reused). Share mode not enabled.`,
          )
          return
        }
        if (result.kind === 'error') {
          vscode.window.showErrorMessage(`Beauty Diagram: share-mode pre-fetch failed (${result.message})`)
          return
        }
        if (updated !== original) await replaceEntireDocument(doc, updated)
        await refreshActivePreview()
        vscode.window.showInformationMessage(
          `Beauty Diagram: share mode enabled. ${result.fetched} new diagram(s) cached` +
            (result.reused > 0 ? ` (${result.reused} already in cache)` : '') +
            '. First preview consumes 1 share quota per unique diagram.',
        )
      } else {
        if (updated !== original) await replaceEntireDocument(doc, updated)
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
  fetched: number
  reused: number
}
interface PreFetchCancelled {
  kind: 'cancelled'
  fetched: number
  reused: number
}
type PreFetchResult = PreFetchOk | PreFetchError | PreFetchCancelled

/**
 * Walk every mermaid/plantuml fence in the document, mint a share token
 * for each (or reuse a cached one), and write to ShareCache so the fence
 * rule can find it synchronously on the next render. Reports granular
 * per-fence progress + respects cancellation so the user can bail out of
 * a large pre-fetch mid-flight (any tokens already minted stay in cache,
 * not wasted).
 */
async function preFetchShareTokens(
  deps: CommandDeps,
  document: string,
  progress?: vscode.Progress<{ message?: string; increment?: number }>,
  cancel?: vscode.CancellationToken,
): Promise<PreFetchResult> {
  const apiKey = getConfig('apiKey') || ''
  const defaultTheme = getConfig('defaultTheme') as string
  const ownerTag = await shortHash('owner:' + apiKey)

  // Parse with the same markdown-it the preview uses so we see exactly
  // the same fence token.content as fence rule will see at render time.
  const md = new MarkdownIt()
  const allTokens = md.parse(document, {})
  const fences = allTokens.filter((t) => {
    if (t.type !== 'fence') return false
    const info = (t.info || '').trim().toLowerCase()
    return info === 'mermaid' || info === 'plantuml'
  })

  let fetched = 0
  let reused = 0
  const step = fences.length > 0 ? 100 / fences.length : 100

  for (let i = 0; i < fences.length; i++) {
    if (cancel?.isCancellationRequested) {
      return { kind: 'cancelled', fetched, reused }
    }
    const tok = fences[i]
    const sourceFormat = (tok.info || '').trim().toLowerCase() as SourceFormat
    const { overrides, source: cleanSource } = parseDirective(sourceFormat, tok.content)
    const theme = overrides.theme ?? defaultTheme

    progress?.report({ message: `Diagram ${i + 1} / ${fences.length}`, increment: step })

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
      return { kind: 'error', message: msg, fetched, reused }
    }
  }

  return { kind: 'ok', fetched, reused }
}

/**
 * Wrap a share-resolver in a cancellation guard so a withProgress cancel
 * stops walking remaining fences without throwing. Returns null on cancel
 * just like the underlying resolver does on API failure — the injection
 * module already treats null as "couldn't resolve, leave anonymous".
 */
function makeCancellableResolver(
  resolver: (src: string, theme: string, fmt: SourceFormat) => Promise<string | null>,
  cancel: vscode.CancellationToken,
): (src: string, theme: string, fmt: SourceFormat) => Promise<string | null> {
  return async (src, theme, fmt) => {
    if (cancel.isCancellationRequested) return null
    return resolver(src, theme, fmt)
  }
}
