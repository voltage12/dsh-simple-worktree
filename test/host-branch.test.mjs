import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessionBranch } from '../src/host/index.js'

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

test('session branch reports the branch for a repository cwd, including nested paths', async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'session-branch-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const repo = join(root, 'repo')
  await fs.mkdir(join(repo, 'nested'), { recursive: true })
  git(repo, 'init', '-b', 'feature/session-dialog')
  git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'init')

  assert.deepEqual(await sessionBranch(join(repo, 'nested')), { isRepo: true, branch: 'feature/session-dialog' })
})

test('session branch hides non-repositories and detached HEAD', async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'session-branch-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const outside = join(root, 'outside')
  const repo = join(root, 'repo')
  await fs.mkdir(outside)
  await fs.mkdir(repo)
  git(repo, 'init', '-b', 'main')
  git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'init')
  const head = git(repo, 'rev-parse', 'HEAD').trim()

  assert.deepEqual(await sessionBranch(outside), { isRepo: false, branch: '' })
  git(repo, 'checkout', '--detach', head)
  assert.deepEqual(await sessionBranch(repo), { isRepo: true, branch: '' })
})
