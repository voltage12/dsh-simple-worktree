import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/client/delete-worktree.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const { createDeleteWorktree } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)

function fixture() {
  const events = []
  const state = {
    items: [{ workspaceId: 'w', path: '/repo/tree', sessionIds: ['a', 'b', 'old'] }],
    archivedSessionIds: ['old'], pinnedSessionIds: ['a'],
  }
  const sessions = { byId: { a: { running: false }, b: { running: false }, old: { running: false } } }
  const input = { sessionId: 'a', workspaceId: 'w', path: '/repo/tree' }
  const ctx = {
    workspaces: {
      list: { getSnapshot: () => state },
      async delete(id) { events.push(`delete:${id}`); state.items = [] },
      async pinSession(id) { events.push(`pin:${id}`); state.pinnedSessionIds.push(id) },
    },
    sessions: { list: { getSnapshot: () => sessions } },
    uiWorkspace: {
      async archiveSession(id) {
        events.push(`archive:${id}`)
        state.archivedSessionIds.push(id)
        state.pinnedSessionIds = state.pinnedSessionIds.filter(item => item !== id)
      },
      async unarchiveSession(id) {
        events.push(`restore:${id}`)
        state.archivedSessionIds = state.archivedSessionIds.filter(item => item !== id)
      },
    },
  }
  const remove = async () => { events.push('git'); return { removed: true, path: input.path } }
  return { events, state, sessions, input, ctx, remove }
}

test('Git completes before archival; unregister is last; preexisting archives stay archived', async () => {
  const f = fixture()
  await createDeleteWorktree(f.ctx, f.remove)(f.input)
  assert.deepEqual(f.events, ['git', 'archive:a', 'archive:b', 'delete:w'])
  assert.deepEqual(f.state.archivedSessionIds, ['old', 'a', 'b'])
})
for (const error of ['Git refused', 'directory cleanup failed', 'unexpected failure']) {
  test(`${error}: workspace, archive and pins remain unchanged; retry works`, async () => {
    const f = fixture()
    let fail = true
    const run = createDeleteWorktree(f.ctx, async () => {
      f.events.push('git')
      if (fail) throw new Error(error)
      return { removed: true, path: f.input.path }
    })
    await assert.rejects(run(f.input), new RegExp(error))
    assert.deepEqual(f.events, ['git'])
    assert.equal(f.state.items.length, 1)
    assert.deepEqual(f.state.archivedSessionIds, ['old'])
    assert.deepEqual(f.state.pinnedSessionIds, ['a'])
    fail = false
    await run(f.input)
    assert.deepEqual(f.events, ['git', 'git', 'archive:a', 'archive:b', 'delete:w'])
  })
}
test('missing workspace and running or unknown sessions refuse before Git', async () => {
  for (const kind of ['missing', 'running', 'unknown']) {
    const f = fixture()
    if (kind === 'missing') f.state.items = []
    if (kind === 'running') f.sessions.byId.b.running = true
    if (kind === 'unknown') delete f.sessions.byId.b
    await assert.rejects(createDeleteWorktree(f.ctx, f.remove)(f.input))
    assert.deepEqual(f.events, [])
  }
})
test('archive refusal restores this operation only, restores pins, retry skips disk deletion', async () => {
  const f = fixture()
  const archive = f.ctx.uiWorkspace.archiveSession
  f.ctx.uiWorkspace.archiveSession = async id => {
    if (id === 'b') throw new Error('session-active')
    await archive(id)
  }
  const run = createDeleteWorktree(f.ctx, f.remove)
  await assert.rejects(run(f.input), /磁盘删除已完成/)
  assert.deepEqual(f.state.archivedSessionIds, ['old'])
  assert.deepEqual(f.state.pinnedSessionIds, ['a'])
  assert.equal(f.state.items.length, 1)
  f.ctx.uiWorkspace.archiveSession = archive
  await run(f.input)
  assert.equal(f.events.filter(x => x === 'git').length, 1)
  assert.equal(f.events.at(-1), 'delete:w')
})
test('unregister failure restores sessions and leaves retryable registration', async () => {
  const f = fixture()
  const unregister = f.ctx.workspaces.delete
  f.ctx.workspaces.delete = async () => { throw new Error('unregister failed') }
  const run = createDeleteWorktree(f.ctx, f.remove)
  await assert.rejects(run(f.input), /unregister failed/)
  assert.deepEqual(f.state.archivedSessionIds, ['old'])
  assert.deepEqual(f.state.pinnedSessionIds, ['a'])
  f.ctx.workspaces.delete = unregister
  await run(f.input)
  assert.equal(f.events.filter(x => x === 'git').length, 1)
})
for (const kind of ['member added', 'workspace moved', 'workspace removed', 'session started', 'session moved']) {
  test(`${kind} during Git stops cleanup`, async () => {
    const f = fixture()
    const run = createDeleteWorktree(f.ctx, async () => {
      const result = await f.remove()
      if (kind === 'member added') f.state.items[0].sessionIds.push('new')
      if (kind === 'workspace moved') f.state.items[0].path = '/another'
      if (kind === 'workspace removed') f.state.items = []
      if (kind === 'session started') f.sessions.byId.b.running = true
      if (kind === 'session moved') f.sessions.byId.b.cwd = '/other'
      return result
    })
    await assert.rejects(run(f.input), /磁盘删除已完成/)
    assert.deepEqual(f.events, ['git'])
    assert.deepEqual(f.state.archivedSessionIds, ['old'])
  })
}
test('membership change during archival stops unregister and restores archived session', async () => {
  const f = fixture()
  const archive = f.ctx.uiWorkspace.archiveSession
  f.ctx.uiWorkspace.archiveSession = async id => {
    await archive(id)
    f.state.items[0].sessionIds.push('new')
  }
  await assert.rejects(createDeleteWorktree(f.ctx, f.remove)(f.input), /工作区已变化/)
  assert.equal(f.events.some(x => x.startsWith('delete:')), false)
  assert.deepEqual(f.state.archivedSessionIds, ['old'])
})
test('rollback failure names session for manual recovery and attempts remaining restores', async () => {
  const f = fixture()
  f.ctx.workspaces.delete = async () => { throw new Error('unregister failed') }
  const restore = f.ctx.uiWorkspace.unarchiveSession
  f.ctx.uiWorkspace.unarchiveSession = async id => {
    if (id === 'b') throw new Error('restore failed')
    await restore(id)
  }
  await assert.rejects(createDeleteWorktree(f.ctx, f.remove)(f.input), /检查并恢复会话归档\/置顶状态：b/)
  assert.deepEqual(f.state.archivedSessionIds, ['old', 'b'])
  assert.equal(f.state.items.length, 1)
})
test('concurrent deletes for same workspace do not issue a second Git request', async () => {
  const f = fixture()
  let release
  const run = createDeleteWorktree(f.ctx, () => new Promise(resolve => { release = resolve }))
  const first = run(f.input)
  await assert.rejects(run(f.input), /正在进行/)
  release({ removed: true, path: f.input.path })
  await first
})
test('unconfirmed disk result does not archive or unregister', async () => {
  const f = fixture()
  await assert.rejects(createDeleteWorktree(f.ctx, async () => ({ removed: false, path: f.input.path }))(f.input), /未确认/)
  assert.deepEqual(f.events, [])
})
