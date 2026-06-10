# Beauty Diagram for VS Code

> **Make every `` ```mermaid `` and `` ```plantuml `` block in your Markdown Preview look like a deck slide — 9 themes, dark-mode friendly, zero setup.**

**Works in VS Code, Cursor, Windsurf, VSCodium, Gitpod, and GitHub Codespaces** — same extension, published to both VS Code Marketplace and [Open VSX](https://open-vsx.org/extension/beauty-diagram/beauty-diagram).

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
- **Embed share URLs** — one command bakes `<img>` references into the markdown so any reader (GitHub, Notion paste, blog static sites, extension-less colleagues) sees the polished diagram
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

### Opting a block out entirely

Prefer VS Code's built-in mermaid rendering for a specific diagram? Add `%% bd:exclude` and the extension leaves that block to the built-in renderer — no Beauty Diagram request, and the "Embed share URLs" commands skip it (removing any embed they previously added):

````md
```mermaid
%% bd:exclude
gantt
  title I like the native gantt
```
````

### Two ways to go watermark-free

The extension offers two distinct features, depending on who you want to see the polished diagrams. Pick the one that matches your intent — they're independent and can be combined.

#### Option 1 — Watermark-free preview (for your own viewing in VS Code)

By default every diagram renders via the anonymous endpoint `/v1/beautify.svg` — fast, no quota, **always watermarked**. This applies to everyone including Pro users.

If you have a Pro or Premium plan, you can opt in **per page** to render diagrams without watermark **in your own Markdown Preview**:

1. Open the markdown file.
2. Command Palette → **Beauty Diagram: Toggle watermark-free preview for this page**.
3. The extension adds a marker to the page's YAML front-matter:

   ```yaml
   ---
   # Beauty Diagram: share-mode (watermark-free preview, consumes share quota per unique diagram).
   bd-share: true
   ---
   ```

4. The extension pre-fetches share tokens for every fence in the file (1 share quota per unique diagram source). Markdown Preview then renders those fences via `/v1/share/<token>.svg` — no watermark.

> **Scope**: this only changes what _you_ see in _your_ VS Code. The markdown source body is unchanged, so anyone reading the same `.md` file outside this extension (GitHub web view, Notion paste, a colleague without the extension) still sees the watermarked anonymous render. To share watermark-free with others, use Option 2.

**Quota model**: each unique diagram source consumes 1 share quota (Pro: 100/month) on its first toggle. Subsequent toggles on the same source hit the local cache for free.

Run the toggle command again to disable. Free users see an upgrade prompt and no quota is consumed.

> **Implementation note**: unlike Obsidian, VS Code's built-in markdown preview doesn't allow webview-side async messaging back to the extension host (VS Code maintainers explicitly rejected this — see microsoft/vscode#174080 and #248934). So the extension pre-fetches all share tokens at toggle time, and the fence rule reads from the local cache synchronously. If you add a new diagram to a watermark-free page, run the toggle command twice (off → on) to re-pre-fetch.

#### Option 2 — Embed share URLs (so anyone, anywhere, sees the diagram)

When you commit `.md` files to git and want them rendered on GitHub, Notion, blog static sites, or by colleagues without the extension, run from Command Palette (`Cmd+Shift+P`):

- **Beauty Diagram: Embed share URLs into this note** — rewrites the active document with `<img>` references next to each fence
- **Beauty Diagram: Embed share URLs into this workspace** — same operation across every `.md` file in the workspace. Idempotent.
- **Beauty Diagram: Clean orphan embeds in workspace** — removes embed blocks whose source fence has been deleted

The injected `<img>` URLs are watermark-free when an API key is configured (Pro+ account); otherwise they fall back to the anonymous watermarked URL — so the embed command never breaks just because you don't have a paid plan.

> **Difference from Option 1**: this modifies the markdown file (writes `<img src="...">` HTML next to each fence). The diagram-rendering URL is baked into the file itself, so anyone who reads the file — even outside VS Code — gets the polished render directly from our server. The marker format is identical to the [`bd` CLI](https://www.npmjs.com/package/@beauty-diagram/cli) and the Obsidian plugin, so all three tools interoperate.

## Configuration

Settings → search "beautyDiagram":

| Setting | Default | Notes |
| --- | --- | --- |
| `beautyDiagram.apiKey` | empty | Optional. Required for watermark-free preview and for watermark-free embed URLs. Without one, preview renders anonymously (watermarked) and the embed command falls back to anonymous URLs. Get a key at [beauty-diagram.com/account/api-keys](https://www.beauty-diagram.com/account/api-keys). The **Verify API key** command surfaces your plan + monthly share quota usage. |
| `beautyDiagram.apiBase` | `https://api.beauty-diagram.com` | Self-host override. |
| `beautyDiagram.defaultTheme` | `classic` | One of 9 themes; per-block directive overrides. |
| `beautyDiagram.replaceMermaid` | `true` | Off lets built-in VS Code preview handle mermaid. |
| `beautyDiagram.handlePlantuml` | `true` | Off leaves plantuml fences as plain text. |

## Privacy

**This extension makes HTTPS requests to `api.beauty-diagram.com` to render diagrams.** Disclosure:

- **Preview (default)**: every mermaid/plantuml block in Markdown Preview triggers a GET to `/v1/beautify.svg` with source base64-encoded in the URL. Server uses it to render; does not persist.
- **Watermark-free preview (per-page opt-in)**: pages with `bd-share: true` in front-matter trigger `POST /v1/share` using your API key, saving the diagram to your Beauty Diagram account so it can be served without watermark. Without the front-matter marker, the share endpoint is never called.
- **Embed share URLs command**: deliberate command invocation that uses the same `/v1/share` path as the toggle, but writes the resulting `<img>` URLs into the markdown file so the diagrams render anywhere markdown is read.
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
