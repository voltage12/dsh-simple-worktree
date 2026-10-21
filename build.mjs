/**
 * Build both halves:
 *  - src/host/index.js  -> lib/index.js   (ESM, Node platform)
 *  - src/client/index.tsx -> lib/client.js (CJS body wrapped in the
 *    `window.__ModuleLoader__.load({ id, factory })` envelope the DSH web
 *    client uses for profile plugins).
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const root = new URL('.', import.meta.url)
const out = path => new URL(path, root).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

mkdirSync(out('lib'), { recursive: true })

await build({
  entryPoints: [out('src/host/index.js')],
  outfile: out('lib/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'info',
})

await build({
  entryPoints: [out('src/client/index.tsx')],
  outfile: out('.build/client.cjs'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  logLevel: 'info',
})

const body = readFileSync(out('.build/client.cjs'), 'utf8')
const wrapped = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(manifest.name)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
${body.split('\n').map(line => (line === '' ? '' : `\t\t${line}`)).join('\n')}
		return module.exports;
	}
});
`
writeFileSync(out('lib/client.js'), wrapped)
console.log('built lib/index.js and lib/client.js')
