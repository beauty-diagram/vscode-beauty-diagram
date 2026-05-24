import * as vscode from 'vscode'

export interface BeautyDiagramSettings {
  apiKey: string
  apiBase: string
  defaultTheme: string
  /** Workspace-wide default image max-width. Per-page `bd-width` front-matter
   *  overrides this. Accepts `'full'`, `<n>px`, `<n>%`, `<n>em`, `<n>rem`. */
  defaultImageWidth: string
  replaceMermaid: boolean
  handlePlantuml: boolean
}

export const DEFAULT_SETTINGS: BeautyDiagramSettings = {
  apiKey: '',
  apiBase: 'https://api.beauty-diagram.com',
  defaultTheme: 'classic',
  defaultImageWidth: 'full',
  replaceMermaid: true,
  handlePlantuml: true,
}

export function getConfig<K extends keyof BeautyDiagramSettings>(
  key: K,
): BeautyDiagramSettings[K] {
  const config = vscode.workspace.getConfiguration('beautyDiagram')
  return config.get(key, DEFAULT_SETTINGS[key]) as BeautyDiagramSettings[K]
}

export function loadAllSettings(): BeautyDiagramSettings {
  return {
    apiKey: getConfig('apiKey'),
    apiBase: getConfig('apiBase'),
    defaultTheme: getConfig('defaultTheme'),
    defaultImageWidth: getConfig('defaultImageWidth'),
    replaceMermaid: getConfig('replaceMermaid'),
    handlePlantuml: getConfig('handlePlantuml'),
  }
}
