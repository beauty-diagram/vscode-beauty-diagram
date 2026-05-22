# Changelog

## 0.1.18 — 2026-05-22

### Docs

- **readme**: align theme example with `classic` not `memphis`

## 0.1.17 — 2026-05-22

### Chores

- **cleanup**: remove dead front_matter renderer override

## 0.1.16 — 2026-05-22

### Fixes

- **preview**: hide bd-share via previewScript instead of renderer override

## 0.1.15 — 2026-05-22

### Fixes

- **frontmatter**: suppress bd-share chip — read meta.content, not content

## 0.1.14 — 2026-05-21

### Fixes

- **share-mode**: read mode from tokens instead of env (VS Code uses split envs)

## 0.1.13 — 2026-05-21

### Fixes

- **preview**: hide bd-share frontmatter + skip empty fence

## 0.1.12 — 2026-05-21

### Fixes

- **fence**: rollback hover badge wrapper, restore 0.1.8 bare \<img\> output

## 0.1.11 — 2026-05-21

### Fixes

- **fence**: use \<div\> wrapper instead of \<span\> for diagram block

## 0.1.10 — 2026-05-21

### Features

- **ux**: withProgress + cancellation for long-running commands

## 0.1.9 — 2026-05-21

### Fixes

- **ux**: preview-mode command activation + hover overlay 'Open in editor'

## 0.1.8 — 2026-05-21

### Features

- **share-mode**: per-page bd-share opt-in with pre-fetch + plan gating
- **share-mode**: copy pure module from obsidian-beauty-diagram

### Fixes

- **share-cache**: namespace entries by API key (parity with obsidian alpha.9)

### Refactors

- **url-composer**: replace hasApiKey with explicit PageMode

## 0.1.7 — 2026-05-21

### Fixes

- **changelog**: escape literal \<img\>/\<svg\> tags so vsce package accepts CHANGELOG.md

All notable changes are documented here. Generated from conventional
commits via `scripts/update-changelog.mjs` on each `npm version` bump.

## 0.1.6 — 2026-05-21

### Fixes

- contributes.markdown.markdownItPlugins must be flat dotted key, not nested

### Docs

- **changelog**: backfill 7 tag sections (0.1.0-alpha.2 → 0.1.5)

### Chores

- auto-generate CHANGELOG.md from conventional commits on npm version

## 0.1.5 — 2026-05-21

### Other

- diag: add console.log to activate() / extendMarkdownIt / fence rule to trace what's firing

## 0.1.4 — 2026-05-21

### CI

- drop --pre-release flag so Marketplace shows stable Install button

## 0.1.3 — 2026-05-21

### Fixes

- **readme**: use 4-backtick outer fence to wrap mermaid example block

## 0.1.2 — 2026-05-21

### Chores

- add 128x128 purple logo icon

## 0.1.1 — 2026-05-21

### CI

- continue-on-error on publish steps so one failure doesn't cascade

## 0.1.0 — 2026-05-21

### CI

- switch to --pre-release flag, drop alpha suffix from version

## 0.1.0-alpha.2 — 2026-05-21

### Features

- **extension**: wire markdownItPlugin export + CodeLens + commands in activate()
- **commands**: register 5 commands (inject current/workspace, clean, verify, openInEditor)
- **codelens-provider**: emit '↗ Open in Beauty Diagram editor' above every mermaid/plantuml fence
- **markdown-it-plugin**: fence rule override emitting \<img\> for mermaid/plantuml
- **share-cache**: vscode.Memento-backed LRU + TTL cache for share tokens
- **api-client**: Node fetch transport with X-Bd-Client: vscode header
- **settings**: vscode configuration contribution + typed getConfig wrapper
- copy pure modules (types, constants, url-composer, directives, hash, editor-link, injection) from obsidian plugin

### Fixes

- pre-render hero PNGs (vsce rejects SVGs in README)

### Docs

- README hero with live embeds + LICENSE + CHANGELOG

### CI

- tag-triggered release workflow (vsce + ovsx + gh release) + PR CI

### Chores

- one-command release flow + RELEASING.md SOP
- scaffold vscode-beauty-diagram repo

