import { writeFileSync, mkdirSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const API_BASE = 'https://api.beauty-diagram.com/v1/beautify.svg'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

function b64url(s) {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const SRC_A = `flowchart LR
  Start --> Check{OK?}
  Check -->|Yes| Done
  Check -->|No| Retry --> Check`

const SRC_B = `sequenceDiagram
  participant User
  participant API
  User->>API: POST /v1/share
  API-->>User: shareToken`

const SRC_C = `@startuml
actor User
participant System
User -> System: login
System -> User: token
@enduml`

const targets = [
  { src: SRC_A, theme: 'modern', out: 'images/hero-modern.png', width: 560 },
  { src: SRC_A, theme: 'obsidian', out: 'images/hero-obsidian.png', width: 560 },
  { src: SRC_A, theme: 'memphis', out: 'images/hero-memphis.png', width: 560 },
  { src: SRC_B, theme: 'modern', out: 'images/sequence.png', width: 1040 },
  { src: SRC_C, theme: 'modern', out: 'images/plantuml.png', width: 1040 },
]

mkdirSync('images', { recursive: true })

for (const t of targets) {
  const url = `${API_BASE}?source=${b64url(t.src)}&theme=${t.theme}`
  console.log(`Fetching ${t.out} (${t.theme})...`)
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/svg+xml,*/*' } })
  if (!res.ok) {
    console.error(`  HTTP ${res.status} on ${url}`)
    process.exit(1)
  }
  const svg = await res.text()
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: t.width } })
  const png = resvg.render().asPng()
  writeFileSync(t.out, png)
  console.log(`  wrote ${png.byteLength} bytes`)
}

console.log('Done.')
