import { describe, it, expect, vi } from 'vitest'
import { getConfig } from '../src/settings'
import * as vscode from 'vscode'

describe('getConfig', () => {
  it('returns the value from vscode.workspace.getConfiguration', () => {
    const fakeGet = vi.fn((_key: string, _default?: unknown) => 'memphis')
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: fakeGet,
      update: vi.fn(),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>)

    const theme = getConfig('defaultTheme')
    expect(theme).toBe('memphis')
    expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('beautyDiagram')
    expect(fakeGet).toHaveBeenCalledWith('defaultTheme', expect.anything())
  })

  it('returns hardcoded default when vscode returns undefined', () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: <T>(_key: string, dflt?: T) => dflt,
      update: vi.fn(),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>)

    expect(getConfig('defaultTheme')).toBe('classic')
    expect(getConfig('apiBase')).toBe('https://api.beauty-diagram.com')
    expect(getConfig('replaceMermaid')).toBe(true)
    expect(getConfig('apiKey')).toBe('')
  })
})
