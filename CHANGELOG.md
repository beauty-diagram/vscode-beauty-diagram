# Changelog

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

