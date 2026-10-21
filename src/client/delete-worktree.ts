import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

type DeleteInput = { sessionId: string; workspaceId: string; path: string }
type Services = Pick<Context, 'workspaces' | 'sessions' | 'uiWorkspace'>
type Removal = (input: { path: string; force: boolean }) => Promise<{ removed: boolean; path: string }>

/** Keep confirmed disk completion for retries; never infer it from a missing path. */
export function createDeleteWorktree(ctx: Services, removeOnDisk: Removal) {
  const completed = new Map<string, { path: string; workspacePath: string; ids: readonly SessionId[]; cwds: Map<SessionId, string | undefined> }>()
  const active = new Set<string>()

  return async (input: DeleteInput): Promise<void> => {
    if (active.has(input.workspaceId))
      throw new Error('删除操作正在进行，请稍后重试')
    active.add(input.workspaceId)
    const workspaceId = input.workspaceId as WorkspaceId
    const attempted: SessionId[] = []
    const pinned = new Set(ctx.workspaces.list.getSnapshot().pinnedSessionIds)
    try {
      const workspace = ctx.workspaces.list.getSnapshot().items.find(item => item.workspaceId === workspaceId)
      if (workspace === undefined)
        throw new Error('workspace-missing')
      const previous = completed.get(workspaceId)
      const ids = previous?.ids ?? [...workspace.sessionIds]
      const workspacePath = previous?.workspacePath ?? workspace.path
      const cwds = previous?.cwds ?? new Map(ids.map(id => [id, ctx.sessions.list.getSnapshot().byId[id]?.cwd]))
      if (!ids.includes(input.sessionId as SessionId) || (previous !== undefined && previous.path !== input.path))
        throw new Error('工作区已变化，请重新检查后重试')

      const check = () => {
        const current = ctx.workspaces.list.getSnapshot().items.find(item => item.workspaceId === workspaceId)
        if (current === undefined || current.path !== workspacePath
          || current.sessionIds.length !== ids.length || ids.some(id => !current.sessionIds.includes(id)))
          throw new Error('工作区已变化，已停止后续清理，请检查工作区和目录')
        const sessions = ctx.sessions.list.getSnapshot().byId
        if (ids.some(id => sessions[id] === undefined))
          throw new Error('会话状态不可用，请稍后重试')
        if (ids.some(id => sessions[id]?.cwd !== cwds.get(id)))
          throw new Error('会话目录已变化，已停止后续清理，请检查工作区和目录')
        if (ids.some(id => sessions[id]?.running === true))
          throw new Error('running')
      }

      check()
      if (previous === undefined) {
        const result = await removeOnDisk({ path: input.path, force: true })
        if (result.removed !== true || result.path !== input.path)
          throw new Error('未确认 worktree 删除成功，请检查目录')
        completed.set(workspaceId, { path: input.path, workspacePath, ids, cwds })
      }
      check()
      for (const id of ids) {
        if (ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(id))
          continue
        attempted.push(id)
        // Do not stop activity: the Host must refuse a session that became active.
        await ctx.uiWorkspace.archiveSession(id)
        check()
      }
      // Keep registration and the dialog available until every other step succeeded.
      await ctx.workspaces.delete(workspaceId)
      completed.delete(workspaceId)
    } catch (failure) {
      const restoreErrors: string[] = []
      for (const id of attempted.reverse()) {
        try {
          if (ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(id)) {
            await ctx.uiWorkspace.unarchiveSession(id)
            if (pinned.has(id))
              await ctx.workspaces.pinSession(id)
          }
        } catch {
          restoreErrors.push(id)
        }
      }
      if (completed.has(workspaceId) || restoreErrors.length > 0) {
        const detail = failure instanceof Error ? failure.message : String(failure)
        throw new Error(`${detail}；worktree 磁盘删除已完成，工作区清理未完成，可在当前窗口重试（路径：${input.path}）`
          + (restoreErrors.length > 0 ? `；请检查并恢复会话归档/置顶状态：${restoreErrors.join(', ')}` : ''))
      }
      throw failure
    } finally {
      active.delete(input.workspaceId)
    }
  }
}
