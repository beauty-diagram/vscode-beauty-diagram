# Beauty Diagram for VS Code

> **Make every `` ```mermaid `` and `` ```plantuml `` block in your Markdown Preview look like a deck slide — 9 themes, dark-mode friendly, zero setup.**

This extension intercepts mermaid and plantuml fenced code blocks in VS Code's built-in Markdown Preview and renders them via the [Beauty Diagram](https://www.beauty-diagram.com) API. Same render quality as Obsidian, Notion embeds, and the standalone editor.

## See it in action

The same `flowchart LR` source, three different themes:

| Modern | Obsidian | Memphis (Premium) |
|---|---|---|
| <img src="images/hero-modern.png" width="280"> | <img src="images/hero-obsidian.png" width="280"> | <img src="images/hero-memphis.png" width="280"> |

## Features

- **9 polished themes**: Classic, Modern, Slate (Free); Atlas, Obsidian, Brutalist, Atelier (Pro); Blueprint, Memphis (Premium)
- **Per-block override** via `%% bd:theme=classic` (mermaid) / `' bd:theme=classic` (plantuml) directive
- **`↗ Open in Beauty Diagram editor` CodeLens** above every fence — one click to fullscreen edit, export, share
- **Source injection commands** — write portable `<img>` references into your Markdown so diagrams render in GitHub READMEs, blog static sites, and Notion paste
- **PlantUML supported** with the same theme pipeline (no local Java setup)
- **Self-hostable** via `beautyDiagram.apiBase` setting

## Sequence and PlantUML

<img src="images/sequence.png" width="520">

<img src="images/plantuml.png" width="520">

## Installation

VS Code Marketplace: search for "Beauty Diagram" in Extensions.

Or from CLI:

```bash
code --install-extension beauty-diagram.beauty-diagram
```

## Usage

### Default render

Open any `.md` file with a `mermaid` or `plantuml` fence. Open the preview (`Cmd+K V` on macOS, `Ctrl+K V` on Windows/Linux). Every block renders via Beauty Diagram automatically.

### Per-block theme override

````md
```mermaid
%% bd:theme=classic
flowchart LR
  A --> B
```
````

For PlantUML, use `' bd:theme=classic` instead.

### Share mode (Pro+, per-page opt-in)

By default every diagram renders via the anonymous endpoint `/v1/beautify.svg` — fast, no quota, **always watermarked**. This applies to everyone including Pro users.

If you have a Pro or Premium plan, you can opt in **per page** to render diagrams without watermark:

1. Open the markdown file in any view.
2. Command Palette → **Beauty Diagram: Toggle share mode for this page**.
3. The extension adds a marker to the page's YAML front-matter:

   ```yaml
   ---
   # Beauty Diagram: share-mode (watermark-free preview, consumes share quota per unique diagram).
   bd-share: true
   ---
   ```

4. The extension also pre-fetches share tokens for every fence in the file (1 share quota per unique diagram source). Markdown Preview then renders those fences via `/v1/share/<token>.svg` — no watermark.

**Quota model**: each unique diagram source consumes 1 share quota (Pro: 100/month) on its first toggle. Subsequent toggles on the same source hit the local cache for free.

Run the toggle command again to disable. Free users see an upgrade prompt and no quota is consumed.

> **Implementation note**: unlike Obsidian, VS Code's built-in markdown preview doesn't allow webview-side async messaging back to the extension host (VS Code maintainers explicitly rejected this — see microsoft/vscode#174080 and #248934). So the extension pre-fetches all share tokens at toggle time, and the fence rule reads from the local cache synchronously. If you add a new diagram to a share-mode page, run the toggle command twice (off → on) to re-pre-fetch.

### Source injection (portable diagrams)

When you commit `.md` files to git and have them rendered on GitHub, Notion, blog static sites, etc., run from Command Palette (`Cmd+Shift+P`):

- **Beauty Diagram: Inject embed URLs in current file** — rewrites the active document with `<img>` references next to each fence
- **Beauty Diagram: Inject embed URLs in workspace** — same for every `.md` file
- **Beauty Diagram: Clean orphan embed URLs in workspace** — removes references whose source fence is gone

The marker format is identical to the [`bd` CLI](https://www.npmjs.com/package/@beauty-diagram/cli) and Obsidian plugin — bidirectional idempotency.

## Configuration

Settings → search "beautyDiagram":

| Setting | Default | Notes |
| --- | --- | --- |
| `beautyDiagram.apiKey` | empty | Optional. Required for share mode and source injection. Without one, preview renders anonymously (watermarked). Get a key at [beauty-diagram.com/account/api-keys](https://www.beauty-diagram.com/account/api-keys). The **Verify API key** command surfaces your plan + monthly share quota usage. |
| `beautyDiagram.apiBase` | `https://api.beauty-diagram.com` | Self-host override. |
| `beautyDiagram.defaultTheme` | `classic` | One of 9 themes; per-block directive overrides. |
| `beautyDiagram.replaceMermaid` | `true` | Off lets built-in VS Code preview handle mermaid. |
| `beautyDiagram.handlePlantuml` | `true` | Off leaves plantuml fences as plain text. |

## Privacy

**This extension makes HTTPS requests to `api.beauty-diagram.com` to render diagrams.** Disclosure:

- **Preview (default)**: every mermaid/plantuml block in Markdown Preview triggers a GET to `/v1/beautify.svg` with source base64-encoded in the URL. Server uses it to render; does not persist.
- **Share mode (per-page opt-in)**: pages with `bd-share: true` in front-matter trigger `POST /v1/share` using your API key, saving the diagram to your Beauty Diagram account so it can be served without watermark. Without the front-matter marker, the share endpoint is never called.
- **Source injection command**: deliberate command invocation that uses the same `/v1/share` path as share mode, but writes the resulting URLs into the markdown file so the diagrams render anywhere markdown is read.
- **Analytics**: `X-Bd-Client: vscode` header in API calls for aggregate health monitoring. No personal data, no telemetry endpoints.

### Opt-out

- **Disable the extension entirely** — Extensions panel → toggle Beauty Diagram off
- **Disable per format** — turn off `beautyDiagram.replaceMermaid` or `beautyDiagram.handlePlantuml`
- **Self-host** — set `beautyDiagram.apiBase` to your own Beauty Diagram instance

## How it compares

|  | Beauty Diagram | Markdown Preview Mermaid Support | Built-in VS Code |
|---|---|---|---|
| Mermaid support | ✅ | ✅ | ✅ |
| PlantUML support | ✅ | ❌ | ❌ |
| Themes | 9 | 1 | 1 |
| Bundle size | ~10 KB | ~1.5 MB | — |
| Self-host | ✅ | ❌ | — |

## License

MIT. See [LICENSE](LICENSE).
