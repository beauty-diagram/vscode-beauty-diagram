import type { SourceFormat } from './types'

export interface ApiClientOptions {
  apiBase: string
  apiKey: string | null
  version: string
  /** Injectable transport. Defaults to global `fetch`. */
  fetchFn?: typeof fetch
}

export interface ShareInput {
  source: string
  theme: string
  sourceFormat: SourceFormat
}

export interface ShareResult {
  diagramId: string
  shareToken: string
  sharePath: string
  shareUrl: string
  title: string | null
  diagramType: string
}

export interface ThemeInfo {
  id: string
  name: string
  tier: string
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export interface ApiClient {
  createShare(input: ShareInput): Promise<ShareResult>
  getThemes(): Promise<ThemeInfo[]>
  getUsage(): Promise<unknown>
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const fetchFn = opts.fetchFn ?? fetch
  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Bd-Client': 'vscode',
      'User-Agent': `Beauty-Diagram-VSCode/${opts.version}`,
    }
    if (opts.apiKey) h.Authorization = `Bearer ${opts.apiKey}`
    return h
  }

  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    let res: Response
    try {
      res = await fetchFn(`${opts.apiBase}${path}`, {
        method,
        headers: buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (err) {
      throw new ApiError(0, 'network_error', (err as Error).message ?? 'Network request failed')
    }
    const ct = res.headers.get('content-type') ?? ''
    const data: unknown = ct.includes('json') ? await res.json() : await res.text()
    if (!res.ok) {
      const code = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : 'unknown'
      const message = data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `HTTP ${res.status}`
      throw new ApiError(res.status, code, message)
    }
    return data as T
  }

  return {
    createShare: (input) => request<ShareResult>('POST', '/v1/share', input),
    getThemes: async () => {
      const r = await request<{ themes: ThemeInfo[] }>('GET', '/v1/themes')
      return r.themes
    },
    getUsage: () => request<unknown>('GET', '/v1/usage'),
  }
}
