import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { spawn as realSpawn, execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let fault
let calls = []
mock.module('node:child_process', { namedExports: {
  spawn(command, args, options) {
    calls.push(args)
    const result = fault?.(args, options)
    if (!result) return realSpawn(command, args, options)
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    queueMicrotask(() => {
      if (result.error) child.emit('error', result.error)
      else {
        child.stderr.end(result.stderr ?? '')
        child.emit('close', result.code ?? 0)
      }
    })
    return child
  },
} })
let lstatFault
mock.module('node:fs/promises', { namedExports: {
  ...fs,
  async lstat(path, ...args) {
    if (lstatFault) return lstatFault(path)
    return fs.lstat(path, ...args)
  },
} })
const { removeWorktree } = await import('../src/host/index.js')

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}
async function fixture(t) {
  fault = undefined
  lstatFault = undefined
  calls = []
  const root = await fs.mkdtemp(join(tmpdir(), 'worktree-delete-'))
  t.after(async () => {
    fault = undefined
    lstatFault = undefined
    await fs.rm(root, { recursive: true, force: true })
  })
  const repo = join(root, 'repo')
  const path = join(root, 'linked tree')
  await fs.mkdir(repo)
  git(repo, 'init', '-b', 'main')
  git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'init')
  git(repo, 'worktree', 'add', '-b', 'feature', path)
  await fs.writeFile(join(path, 'user-data'), 'keep me')
  return { repo, path }
}
async function intact({ repo, path }) {
  assert.equal(await fs.readFile(join(path, 'user-data'), 'utf8'), 'keep me')
  assert.match(git(repo, 'worktree', 'list', '--porcelain'), /branch refs\/heads\/feature/)
  assert.equal(calls.some(args => args[0] === 'worktree' && ['unlock', 'prune'].includes(args[1])), false)
}

test('normal forced deletion removes registration and directory, keeps branch and main checkout', async t => {
  const f = await fixture(t)
  assert.equal((await removeWorktree({ path: f.path, force: true })).removed, true)
  await assert.rejects(fs.lstat(f.path), { code: 'ENOENT' })
  assert.doesNotMatch(git(f.repo, 'worktree', 'list', '--porcelain'), /feature/)
  assert.match(git(f.repo, 'branch', '--list', 'feature'), /feature/)
  assert.equal((await fs.stat(f.repo)).isDirectory(), true)
})
test('Git lock refusal preserves data and lock; retry after explicit unlock succeeds', async t => {
  const f = await fixture(t)
  git(f.repo, 'worktree', 'lock', '--reason', 'user protection', f.path)
  await assert.rejects(removeWorktree({ path: f.path, force: true }), /锁定/)
  await intact(f)
  assert.match(git(f.repo, 'worktree', 'list', '--porcelain'), /locked user protection/)
  git(f.repo, 'worktree', 'unlock', f.path)
  await removeWorktree({ path: f.path, force: true })
})
test('non-forced dirty worktree is preserved', async t => {
  const f = await fixture(t)
  await assert.rejects(removeWorktree({ path: f.path }), /未提交/)
  await intact(f)
})
for (const [name, result] of [
  ['directory cleanup failure', { code: 128, stderr: 'fatal: failed to delete directory: Permission denied' }],
  ['unexpected Git error', { code: 128, stderr: 'fatal: corrupt repository' }],
  ['Git spawn failure', { error: Object.assign(new Error('spawn failed'), { code: 'EACCES' }) }],
]) {
  test(`${name} does not fall back to recursive deletion`, async t => {
    const f = await fixture(t)
    fault = args => args[0] === 'worktree' && args[1] === 'remove' ? result : undefined
    await assert.rejects(removeWorktree({ path: f.path, force: true }))
    await intact(f)
  })
}
test('state changes during preflight: newly locked worktree is preserved', async t => {
  const f = await fixture(t)
  fault = args => {
    if (args[0] === 'worktree' && args[1] === 'remove')
      git(f.repo, 'worktree', 'lock', f.path)
  }
  await assert.rejects(removeWorktree({ path: f.path, force: true }), /锁定/)
  await intact(f)
})
test('success with surviving/recreated directory is an error and preserves data', async t => {
  const f = await fixture(t)
  fault = args => args[0] === 'worktree' && args[1] === 'remove' ? { code: 0 } : undefined
  await assert.rejects(removeWorktree({ path: f.path, force: true }), /目录仍存在/)
  await intact(f)
})
test('unexpected post-delete filesystem error is propagated', async t => {
  const f = await fixture(t)
  fault = args => args[0] === 'worktree' && args[1] === 'remove' ? { code: 0 } : undefined
  lstatFault = () => { throw Object.assign(new Error('inspection denied'), { code: 'EACCES' }) }
  await assert.rejects(removeWorktree({ path: f.path, force: true }), /inspection denied/)
  await intact(f)
})
test('main repository is never deleted', async t => {
  const f = await fixture(t)
  await assert.rejects(removeWorktree({ path: f.repo, force: true }), /不在 worktree/)
  await intact(f)
})
test('Git partial cleanup failure keeps remaining user data without pruning registration', async t => {
  const f = await fixture(t)
  const { unlinkSync } = await import('node:fs')
  fault = args => {
    if (args[0] !== 'worktree' || args[1] !== 'remove') return
    unlinkSync(join(f.path, '.git'))
    return { code: 128, stderr: 'fatal: failed to delete worktree directory' }
  }
  await assert.rejects(removeWorktree({ path: f.path, force: true }), /删除/)
  await intact(f)
  // A broken directory must require manual inspection, not trigger broad cleanup.
  await assert.rejects(removeWorktree({ path: f.path, force: true }))
  await intact(f)
})
test('a directory recreated after real Git removal is never recursively deleted', async t => {
  const f = await fixture(t)
  const { mkdirSync, writeFileSync } = await import('node:fs')
  fault = (args, options) => {
    if (args[0] !== 'worktree' || args[1] !== 'remove') return
    git(options.cwd, ...args)
    mkdirSync(f.path)
    writeFileSync(join(f.path, 'new-data'), 'new owner')
    return { code: 0 }
  }
  await assert.rejects(removeWorktree({ path: f.path, force: true }), /目录仍存在/)
  assert.equal(await fs.readFile(join(f.path, 'new-data'), 'utf8'), 'new owner')
  assert.doesNotMatch(git(f.repo, 'worktree', 'list', '--porcelain'), /feature/)
})
