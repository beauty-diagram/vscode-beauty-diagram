import esbuild from 'esbuild'
import process from 'node:process'

const prod = process.argv[2] === 'production'

const ctx = await esbuild.context({
  entryPoints: ['extension.ts'],
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  outfile: 'dist/extension.js',
  minify: prod,
})

if (prod) {
  await ctx.rebuild()
  process.exit(0)
} else {
  await ctx.watch()
}
