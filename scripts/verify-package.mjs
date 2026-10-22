// Run the existing safety regression suite against an installed npm tarball.
// The browser bundle is instrumented only in memory to expose its private helper.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
assert.ok(process.argv[2], 'Usage: node scripts/verify-package.mjs <installed-package-directory>')
const target = resolve(process.argv[2])
const manifest = JSON.parse(readFileSync(resolve(target, 'package.json'), 'utf8'))
assert.equal(manifest.name, '@voltage12/dsh-simple-worktree')
assert.equal(manifest.version, '0.1.2')
assert.equal(manifest.exports['.'], './lib/index.js')
assert.equal(manifest.exports['./client'], './lib/client.js')
for (const file of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'CHANGELOG.md']) {
  assert.equal(readFileSync(resolve(target, file), 'utf8'), readFileSync(resolve(root, file), 'utf8'), `${file} differs from verified checkout`)
}
const output = resolve(root, '.build/package-verification')
mkdirSync(output, { recursive: true })
const loader = resolve(output, 'client-loader.mjs')
writeFileSync(loader, `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(pathToFileURL(resolve(root, 'package.json')).href)});
let loaded;
const bundle = readFileSync(${JSON.stringify(resolve(target, 'lib/client.js'))}, 'utf8');
const marker = 'return module.exports;';
assert.equal(bundle.split(marker).length, 2);
new Function('window', bundle.replace(marker, 'return { ...module.exports, createDeleteWorktree };'))({
  __ModuleLoader__: { load(entry) {
    assert.equal(entry.id, '@voltage12/dsh-simple-worktree');
    loaded = entry.factory(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(id));
  } }
});
assert.equal(typeof loaded.apply, 'function');
export const createDeleteWorktree = loaded.createDeleteWorktree;
`)
const host = readFileSync(resolve(root, 'test/host-delete.test.mjs'), 'utf8')
assert.ok(host.includes("'../src/host/index.js'"))
writeFileSync(resolve(output, 'host.test.mjs'), host.replace("'../src/host/index.js'", JSON.stringify(pathToFileURL(resolve(target, 'lib/index.js')).href)))
const client = readFileSync(resolve(root, 'test/client-delete.test.mjs'), 'utf8')
const start = client.indexOf("import { build } from 'esbuild'")
const end = client.indexOf('\nfunction fixture()')
assert.ok(start >= 0 && end > start)
writeFileSync(resolve(output, 'client.test.mjs'), client.slice(0, start) + "import { createDeleteWorktree } from './client-loader.mjs'\n" + client.slice(end))
const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--test', resolve(output, 'host.test.mjs'), resolve(output, 'client.test.mjs')], { cwd: root, stdio: 'inherit' })
assert.equal(result.status, 0, 'Packaged safety regression tests failed')
console.log('Installed package matches this checkout; Host and Client safety regressions passed.')
