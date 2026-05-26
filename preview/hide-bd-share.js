// Beauty Diagram — Markdown Preview hook to hide Beauty Diagram's internal
// `bd-*` front-matter rows (currently `bd-share`, `bd-width`; matches any
// future plugin-managed key with the same prefix).
//
// Why this lives in a previewScript instead of the markdown-it pipeline:
// VS Code's bundled yamlPreamble extension (which renders front-matter as
// a `<table class="frontmatter">`) is wired into the markdown engine
// AFTER third-party `extendMarkdownIt` contributors. Its
// `md.renderer.rules.front_matter` assignment unconditionally overrides
// anything we set during our `extendMarkdownIt(md)` call — see
// markdownEngine.ts:142-150 in the markdown-language-features source.
//
// So instead of fighting that registration order, we post-process the
// rendered DOM in the webview itself, which `previewScripts` is designed
// for. This is pure view-layer work; we don't talk back to the extension
// host (VS Code maintainers have explicitly rejected bidirectional
// messaging for markdown preview — microsoft/vscode#174080).

(function () {
  'use strict'

  // Match any row whose <th> text starts with `bd-`. The exact set today is
  // `bd-share` and `bd-width`; the prefix match future-proofs us against
  // adding new internal keys without shipping another preview-script bump.
  function isBdRow(row) {
    var th = row.querySelector(':scope > th')
    if (!th) return false
    var key = th.textContent.trim()
    return key.indexOf('bd-') === 0
  }

  function hideBdRows(root) {
    var tables = (root || document).querySelectorAll('table.frontmatter')
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i]
      var rows = table.querySelectorAll('tbody > tr')
      var removedAny = false
      for (var j = 0; j < rows.length; j++) {
        if (isBdRow(rows[j])) {
          rows[j].remove()
          removedAny = true
        }
      }
      // If every row was bd-*, drop the empty table so we don't leave a
      // floating chip box. Other front-matter keys keep their normal
      // rendering.
      if (removedAny && !table.querySelector('tbody > tr')) {
        table.remove()
      }
    }
  }

  // Run on initial load, then again on the frame just before the first
  // paint. The second pass closes the brief window in which yamlPreamble
  // has emitted the table but the browser hasn't displayed it yet —
  // previously the chip could flash visible during fast preview-pane
  // re-renders.
  hideBdRows()
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(function () {
      hideBdRows()
    })
  }

  // Markdown Preview re-renders on document edits + scroll-sync; the
  // webview keeps the same document but swaps the body subtree.
  // MutationObserver catches those re-renders. We deliberately don't
  // `disconnect()` — one selector pass per mutation is negligible vs the
  // risk of a stale chip flashing into view after an edit.
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function (mutations) {
      // Cheap guard: only re-scan if a node was added (not just attribute
      // changes), and bail out fast if no frontmatter table is present
      // in the added subtree.
      for (var k = 0; k < mutations.length; k++) {
        var added = mutations[k].addedNodes
        for (var n = 0; n < added.length; n++) {
          var node = added[n]
          if (node.nodeType !== 1) continue
          if (
            node.matches &&
            (node.matches('table.frontmatter') ||
              node.querySelector('table.frontmatter'))
          ) {
            hideBdRows(node)
            // also re-scan document in case yamlPreamble emitted multiple
            // tables and only one mutation fired
            hideBdRows(document)
            return
          }
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }
})()
