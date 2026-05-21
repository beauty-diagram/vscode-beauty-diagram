// Stub of the vscode module for vitest. The real module is injected by the
// VS Code extension host at runtime. Tests stub-and-spy these exports as
// needed using vi.fn().

export class Range {
  constructor(
    public startLine: number,
    public startCh: number,
    public endLine: number,
    public endCh: number,
  ) {}
}

export class CodeLens {
  constructor(public range: Range, public command?: Command) {}
}

export interface Command {
  title: string
  command: string
  arguments?: unknown[]
}

export class EventEmitter<T> {
  event: (listener: (e: T) => unknown) => { dispose(): void } = () => ({ dispose() {} })
  fire(_e: T): void {}
  dispose(): void {}
}

export const Uri = {
  parse: (s: string) => ({ toString: () => s, fsPath: s }),
  file: (s: string) => ({ toString: () => s, fsPath: s }),
}

export const window = {
  showInformationMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  activeTextEditor: undefined as unknown,
}

export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, _default?: T): T | undefined => _default,
    update: () => Promise.resolve(),
  }),
  findFiles: () => Promise.resolve([]),
  onDidChangeConfiguration: () => ({ dispose() {} }),
  fs: {
    readFile: () => Promise.resolve(new Uint8Array()),
    writeFile: () => Promise.resolve(),
  },
}

export const commands = {
  registerCommand: () => ({ dispose() {} }),
  executeCommand: () => Promise.resolve(),
}

export const languages = {
  registerCodeLensProvider: () => ({ dispose() {} }),
}

export const env = {
  openExternal: () => Promise.resolve(true),
}

export interface TextDocument {
  getText(): string
  languageId: string
  uri: { fsPath: string; toString(): string }
  lineCount: number
}

export class FakeTextDocument implements TextDocument {
  languageId = 'markdown'
  uri = { fsPath: '/fake.md', toString: () => '/fake.md' }
  constructor(private text: string) {}
  getText(): string { return this.text }
  get lineCount(): number { return this.text.split('\n').length }
}

export interface ExtensionContext {
  globalState: Memento
  subscriptions: { dispose(): void }[]
}

export interface Memento {
  get<T>(key: string): T | undefined
  get<T>(key: string, defaultValue: T): T
  update(key: string, value: unknown): Thenable<void>
  keys(): readonly string[]
}
