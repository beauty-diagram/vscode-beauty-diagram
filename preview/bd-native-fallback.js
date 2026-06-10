// Beauty Diagram — per-block fallback to VS Code's built-in mermaid renderer.
//
// When the Beauty Diagram service can't render a mermaid block (unsupported
// syntax, service unreachable), the preview <img> fails to load — the
// markdown-it rule opted into detectable failures via `?onfail=status`
// (server answers 422 with a NON-image body; a 4xx with a valid image body
// would still fire `load`, browsers decode <img> bodies regardless of HTTP
// status). This script swaps the failed img for a `<div class="mermaid">`
// and pokes the built-in `vscode.mermaid-markdown-features` preview script
// to render it — no bundled mermaid.js, no extension-host round trip.
//
// Why DOM injection instead of emitting the fallback markup from the
// markdown-it rule: fence output must stay a bare <img> (wrapper HTML broke
// the preview pipeline in 0.1.9–0.1.11 — see share-mechanism.md §8.5).
// previewScripts mutating the built DOM is the sanctioned pattern
// (same as hide-bd-share.js).
//
// How the built-in renderer is triggered: mermaid-markdown-features wires
// `window.addEventListener('vscode.markdown.updateContent', init)` and its
// init() re-scans `document.body` for `.mermaid` elements (verified against
// the bundled markdown-preview-out/index.js). Dispatching that event after
// inserting our div hands the block to the same renderer + zoom controls
// that native mermaid fences get.

(function () {
  'use strict'

  var BADGE_TEXT =
    "⚠ Rendered by VS Code's built-in Mermaid renderer — Beauty Diagram couldn't render this block"

  /** Recover the diagram source for a failed img. Prefer the data-bd-source
   *  attribute (works for share URLs too); fall back to decoding the
   *  base64url `source` query param of anonymous embed URLs. */
  function sourceFor(img) {
    var attr = img.getAttribute('data-bd-source')
    if (attr) return attr
    var src = img.getAttribute('src') || ''
    var m = /[?&]source=([^&]+)/.exec(src)
    if (!m) return null
    try {
      var b64 = m[1].replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4 !== 0) b64 += '='
      var bin = atob(b64)
      var bytes = new Uint8Array(bin.length)
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new TextDecoder('utf-8').decode(bytes)
    } catch (e) {
      return null
    }
  }

  // The mermaid extension's re-render pass is DESTRUCTIVE for
  // already-rendered blocks: it strips every `.mermaid > svg`, then reads
  // each element's textContent as the source — but the first render
  // replaced that content with the SVG markup, so a synthetic re-render
  // would wipe every previously rendered mermaid block on the page
  // (VS Code's own dispatches are safe only because a real content update
  // replaces the DOM with fresh source elements first). The extension
  // saves the original source into data-vscode-context.mermaidSource on
  // first render; restoring textContent from it makes the global
  // re-render lossless and repeatable (verified against the bundled
  // markdown-preview-out/index.js renderMermaidElement).
  function restoreRenderedMermaidSources() {
    var els = document.querySelectorAll('.mermaid')
    for (var i = 0; i < els.length; i++) {
      var raw = els[i].getAttribute('data-vscode-context')
      if (!raw) continue
      try {
        var src = JSON.parse(raw).mermaidSource
        if (typeof src === 'string' && src) els[i].textContent = src
      } catch (e) {
        /* not a mermaid context payload — leave the element alone */
      }
    }
  }

  // Coalesce multiple failures in one frame into a single re-render poke —
  // the mermaid extension's init() re-scans the whole document each time.
  var pokeQueued = false
  function pokeMermaidRenderer() {
    if (pokeQueued) return
    pokeQueued = true
    setTimeout(function () {
      pokeQueued = false
      try {
        restoreRenderedMermaidSources()
        window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'))
      } catch (e) {
        /* mermaid extension absent — the raw source div stays visible,
           which still beats a placeholder/broken image */
      }
    }, 0)
  }

  function eligible(img) {
    return (
      img.tagName === 'IMG' &&
      img.classList.contains('bd-img') &&
      img.getAttribute('data-bd-source-format') === 'mermaid' &&
      (img.getAttribute('src') || '').indexOf('onfail=status') !== -1
    )
  }

  function handleFailure(img) {
    if (img.getAttribute('data-bd-fallback-done')) return
    img.setAttribute('data-bd-fallback-done', '1')

    // VS Code re-builds the preview DOM on edits; a rebuilt img is fresh
    // (no marker attr) while our injected nodes from the previous pass may
    // survive as siblings. Don't stack duplicates.
    var next = img.nextElementSibling
    if (next && next.hasAttribute('data-bd-injected')) {
      img.style.display = 'none'
      return
    }

    var source = sourceFor(img)
    if (!source) return // leave the broken image — nothing we can do

    var native = document.createElement('div')
    native.className = 'mermaid'
    native.setAttribute('data-bd-injected', '1')
    native.textContent = source

    var badge = document.createElement('div')
    badge.className = 'bd-fallback-badge'
    badge.setAttribute('data-bd-injected', '1')
    badge.textContent = BADGE_TEXT

    img.style.display = 'none'
    img.insertAdjacentElement('afterend', native)
    native.insertAdjacentElement('afterend', badge)
    pokeMermaidRenderer()
  }

  // `error` doesn't bubble — listen in the capture phase at the document
  // level so the handler survives full preview DOM rebuilds.
  document.addEventListener(
    'error',
    function (ev) {
      var t = ev.target
      if (t && t.tagName === 'IMG' && eligible(t)) handleFailure(t)
    },
    true,
  )

  // Images that already failed before this script was injected (script
  // ordering across previewScripts contributions isn't guaranteed):
  // complete && naturalWidth === 0 means the load already failed.
  function sweep() {
    var imgs = document.querySelectorAll('img.bd-img[data-bd-source-format="mermaid"]')
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i]
      if (eligible(img) && img.complete && img.naturalWidth === 0) handleFailure(img)
    }
  }
  sweep()
  window.addEventListener('vscode.markdown.updateContent', function () {
    requestAnimationFrame(sweep)
  })
})()
