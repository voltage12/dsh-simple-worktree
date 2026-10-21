/**
 * @voltage12/dsh-simple-worktree browser half.
 *
 * Two entry points over the host routes:
 *  - `conversation.input.left`: a Worktree button that creates
 *    `<repo>/.agents/worktree/<branch>` and adopts it as a Workspace + Session.
 *  - `sidebar.workspaces.session.menu.item`: a "Delete Worktree" row that
 *    removes the linked worktree, archives the workspace's sessions and then
 *    drops the workspace registration (the branch survives).
 */
import { createDeleteWorktree } from './delete-worktree'
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Button,
  Checkbox,
  IconChevronDownOutlineRegular,
  IconTrashOutlineRegular,
  Input,
  Menu,
  MenuItemButton,
  Modal,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, LocaleDictOf, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'

/**
 * The primitives package only ships a horizontal fork. A vertical trunk reads
 * better in the 28×28 composer button, so this variant stays local.
 */
function IconBranchVerticalRegular({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4.5" cy="3" r="1.5" />
      <circle cx="4.5" cy="13" r="1.5" />
      <circle cx="12" cy="5" r="1.5" />
      <path d="M4.5 4.5v7" />
      <path d="M4.5 8h5.5c1.105 0 2-.895 2-1.5" />
    </svg>
  )
}

export const name = 'simple-worktree'
export const inject = ['slots', 'sessions', 'workspaces', 'uiWorkspace', 'locale']

const ROUTE_PREFIX = '/plugin/simple-worktree'

const NS = 'simpleWorktree'

const zh = {
  button: 'Worktree',
  buttonTitle: '新建 Worktree',
  checking: '正在检查 Git 仓库…',
  notRepo: '当前目录不是 Git 仓库',
  gitMissing: '未找到 git 命令，请先安装 Git 并加入 PATH',
  createTitle: '新建 Worktree',
  modeNew: '新建分支',
  modeExisting: '已有分支',
  branchName: '分支名',
  branchNamePlaceholder: '例如 feat/login',
  baseBranch: '基于分支',
  chooseBranch: '请选择分支',
  occupied: '已被 worktree 占用',
  target: '将创建到',
  cancel: '取消',
  create: '创建',
  creating: '创建中…',
  close: '关闭',
  invalidEmpty: '请输入分支名',
  invalidName: '分支名不合法',
  invalidExists: '本地已存在同名分支，如需为它创建 worktree 请改用「已有分支」',
  invalidSame: '起点不能与分支名相同',
  loadFailed: '读取仓库信息失败',
  deleteMenu: '删除 Worktree',
  deleteCurrent: '删除当前 Worktree',
  deleteTitle: '删除 Worktree',
  deleteWarning: '此操作会删除 worktree 目录，未提交的改动将永久丢失。',
  willArchive: '该工作区下的 {count} 个会话将被归档（含当前会话）',
  willRemoveWorkspace: '工作区注册将被移除',
  willRemoveDir: 'worktree 目录将被删除：',
  dirty: '{count} 个未提交改动',
  ahead: '{count} 个未推送提交',
  branchKept: '分支 {branch} 会保留，不会被删除',
  confirmDelete: '确认删除',
  deleting: '删除中…',
  reading: '读取中…',
  detachedHead: '游离 HEAD',
  notWorktree: '当前会话不在 worktree 中',
  running: '该工作区还有会话正在运行，请先停止后再删除',
  workspaceMissing: '找不到该会话所属的工作区',
  deleted: '已删除 Worktree：{path}',
  workspaceFailed: 'worktree 已创建，但注册工作区失败：',
  sessionFailed: '工作区已注册，但新建会话失败：',
} as const

export type SimpleWorktreeKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    simpleWorktree: SimpleWorktreeKey
  }
}

const en: LocaleDictOf<typeof NS> = zh

// ---------------------------------------------------------------------------
// Host wire
// ---------------------------------------------------------------------------

interface BranchFact {
  name: string
  worktreePath: string | null
}

interface ProbeFact {
  isRepo: boolean
  gitMissing?: boolean
  error?: string
  top?: string
  mainRoot?: string
  isLinkedWorktree?: boolean
  branch?: string
  hasCommits?: boolean
  branches?: BranchFact[]
}

interface CreateFact {
  path: string
  branch: string
  repoRoot: string
}

interface InspectFact {
  path: string
  branch: string
  dirty: number
  ahead: number | null
  repoRoot: string
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const search = query === undefined ? '' : `?${new URLSearchParams(query).toString()}`
  const response = await fetch(`${ROUTE_PREFIX}${path}${search}`, {
    method,
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`)
  return data as T
}

function probeRepo(path: string): Promise<ProbeFact> {
  return request<ProbeFact>('GET', '/probe', undefined, { path })
}

function createOnDisk(input: { path: string; mode: 'new' | 'existing'; branch: string; base?: string }): Promise<CreateFact> {
  return request<CreateFact>('POST', '/create', input)
}

function inspectOnDisk(path: string): Promise<InspectFact> {
  return request<InspectFact>('POST', '/inspect', { path })
}

function removeOnDisk(input: { path: string; force: boolean }): Promise<{ removed: boolean; path: string }> {
  return request('POST', '/remove', input)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Keep every surfaced failure in Chinese: map the transport and git wording. */
function errorText(error: unknown): string {
  const raw = messageOf(error)
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw))
    return '无法连接插件服务，请重启应用后重试'
  if (/enoent|command not found/i.test(raw) && /git/i.test(raw))
    return '未找到 git 命令，请先安装 Git 并加入 PATH'
  if (/already checked out at/i.test(raw))
    return '该分支已被其他 worktree 检出'
  if (/not a git repository/i.test(raw))
    return '当前目录不是 Git 仓库'
  if (/is a missing but already registered worktree/i.test(raw))
    return '该目录已被 git 登记为 worktree，请先执行 git worktree prune'
  if (/contains modified or untracked files/i.test(raw))
    return 'worktree 内有未提交的改动，无法删除'
  if (/is locked/i.test(raw))
    return 'worktree 已被锁定，无法删除'
  if (/invalid reference/i.test(raw))
    return '分支或提交不存在'
  return raw
}

/** Client-side mirror of git's ref-name rules, for immediate feedback only. */
function branchIssue(raw: string, branches: BranchFact[], base: string, mode: 'new' | 'existing'): SimpleWorktreeKey | null {
  const name = raw.trim()
  if (name === '')
    return 'invalidEmpty'
  if (mode === 'new' && name === base)
    return 'invalidSame'
  if (name === '@' || name === 'HEAD')
    return 'invalidName'
  if (name.startsWith('-') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock'))
    return 'invalidName'
  if (/[\s~^:?*[\\\u0000-\u001f]/.test(name))
    return 'invalidName'
  if (name.includes('..') || name.includes('@{') || name.includes('//'))
    return 'invalidName'
  const parts = name.split('/')
  if (parts.some(part => part === '' || part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock')))
    return 'invalidName'
  if (mode === 'new' && branches.some(branch => branch.name === name))
    return 'invalidExists'
  return null
}

function flatten(name: string): string {
  return name.split('/').join('-')
}

// ---------------------------------------------------------------------------
// Small shared UI
// ---------------------------------------------------------------------------

const STYLE = `
.wt-dialog { width: min(460px, 100%) !important; }
.wt-dialog-body { display: flex; flex-direction: column; gap: 14px; width: 100%; min-width: 0; box-sizing: border-box; }
.wt-dialog-path { font-family: var(--dsh-font-mono, ui-monospace, monospace); overflow-wrap: anywhere; word-break: break-word; }
.wt-dialog-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; overflow-wrap: anywhere; }
`

/** Inject the dialog classes once; a reloaded client half reuses the same tag. */
function ensureStyle(): void {
  if (typeof document === 'undefined' || document.querySelector('style[data-simple-worktree-style]') !== null)
    return
  const style = document.createElement('style')
  style.setAttribute('data-simple-worktree-style', '')
  style.textContent = STYLE
  document.head.appendChild(style)
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  lineHeight: '20px',
}

const pickerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  width: '100%',
  minWidth: 0,
  height: 34,
  padding: '0 10px',
  boxSizing: 'border-box',
  borderRadius: 8,
  border: '1px solid var(--dsw-alias-line-2, rgba(128,128,128,.35))',
  background: 'var(--dsw-alias-bg-2, rgba(128,128,128,.08))',
  color: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  textAlign: 'left',
}

const dangerStyle: React.CSSProperties = {
  color: 'var(--dsw-alias-text-error, #e5484d)',
  fontSize: 12,
  lineHeight: '18px',
}

const mutedStyle: React.CSSProperties = {
  opacity: 0.65,
  fontSize: 12,
  lineHeight: '18px',
}

function BranchPicker(props: {
  value: string
  placeholder: string
  branches: BranchFact[]
  disableOccupied: boolean
  autoFocus?: boolean
  t: (key: SimpleWorktreeKey, params?: Record<string, unknown>) => string
  onSelect: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = props.branches.find(branch => branch.name === props.value)
  return (
    <Menu
      open={open}
      autoFocus
      dense
      portal
      align="start"
      side="bottom"
      onClose={() => setOpen(false)}
      anchor={(
        <button
          type="button"
          data-modal-autofocus={props.autoFocus === true ? '' : undefined}
          style={pickerStyle}
          onClick={() => setOpen(next => !next)}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected === undefined ? props.placeholder : selected.name}
          </span>
          <IconChevronDownOutlineRegular size={12} />
        </button>
      )}
      items={props.branches.map(branch => ({
        id: branch.name,
        label: props.disableOccupied && branch.worktreePath !== null
          ? `${branch.name}  ·  ${props.t('occupied')}`
          : branch.name,
        disabled: props.disableOccupied && branch.worktreePath !== null,
      }))}
      onSelect={id => {
        setOpen(false)
        props.onSelect(id)
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Create dialog (composer button)
// ---------------------------------------------------------------------------

interface CreateActions {
  createWorktree: (input: { path: string; mode: 'new' | 'existing'; branch: string; base?: string }) => Promise<CreateFact>
}

type CreateButtonProps =
  & PropsRuntime<'conversation.input.left'>
  & PropsLocale<typeof NS>
  & InjectFace<CreateActions>

function CreateWorktreeDialog(props: {
  cwd: string
  initial: ProbeFact
  t: CreateButtonProps['t']
  createWorktree: CreateActions['createWorktree']
  onClose: () => void
  onDeleteCurrent: () => void
}) {
  const { t } = props
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [branch, setBranch] = useState('')
  const [base, setBase] = useState(props.initial.branch ?? 'HEAD')
  const [existing, setExisting] = useState('')
  const [info, setInfo] = useState<ProbeFact>(props.initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    probeRepo(props.cwd)
      .then(next => {
        if (!alive || next.isRepo !== true)
          return
        setInfo(next)
        if (next.branch !== undefined)
          setBase(current => (current === 'HEAD' ? next.branch as string : current))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [props.cwd])

  const branches = info.branches ?? []
  const draft = mode === 'new' ? branch : existing
  const issue = draft.trim() === '' ? null : branchIssue(draft, branches, base, mode)
  const valid = draft.trim() !== '' && issue === null
  const separator = info.mainRoot?.includes('\\') === true ? '\\' : '/'
  const target = info.mainRoot === undefined || draft.trim() === ''
    ? ''
    : `${info.mainRoot}${separator}.agents${separator}worktree${separator}${flatten(draft.trim())}`

  const submit = async () => {
    if (!valid || busy)
      return
    setBusy(true)
    setError('')
    try {
      await props.createWorktree({
        path: props.cwd,
        mode,
        branch: draft.trim(),
        ...(mode === 'new' ? { base } : {}),
      })
      props.onClose()
    }
    catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }

  const close = () => {
    if (!busy)
      props.onClose()
  }

  return (
    <Modal
      open
      className="wt-dialog"
      title={t('createTitle')}
      closeLabel={t('close')}
      onClose={close}
      footer={(
        <>
          {info.isLinkedWorktree === true && (
            <Button
              variant="ghost"
              onClick={props.onDeleteCurrent}
              disabled={busy}
              style={{ color: 'var(--dsw-alias-text-error, #e5484d)', marginRight: 'auto' }}
            >
              {t('deleteCurrent')}
            </Button>
          )}
          <Button variant="ghost" onClick={close} disabled={busy}>{t('cancel')}</Button>
          <Button variant="primary" onClick={() => { void submit() }} disabled={!valid || busy}>
            {busy ? t('creating') : t('create')}
          </Button>
        </>
      )}
    >
      <div className="wt-dialog-body">
        <Checkbox
          checked={mode === 'new'}
          onChange={() => setMode('new')}
          label={t('modeNew')}
          disabled={busy}
        />
        {mode === 'new' && (
          <>
            <div style={fieldStyle}>
              <span>{t('branchName')}</span>
              <Input
                value={branch}
                placeholder={t('branchNamePlaceholder')}
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
                data-modal-autofocus=""
                onChange={event => setBranch(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter')
                    void submit()
                }}
              />
            </div>
            <div style={fieldStyle}>
              <span>{t('baseBranch')}</span>
              <BranchPicker
                value={base}
                placeholder={t('chooseBranch')}
                branches={branches}
                disableOccupied={false}
                t={t}
                onSelect={setBase}
              />
            </div>
          </>
        )}
        <Checkbox
          checked={mode === 'existing'}
          onChange={() => setMode('existing')}
          label={t('modeExisting')}
          disabled={busy}
        />
        {mode === 'existing' && (
          <div style={fieldStyle}>
            <BranchPicker
              value={existing}
              placeholder={t('chooseBranch')}
              branches={branches}
              disableOccupied
              autoFocus
              t={t}
              onSelect={setExisting}
            />
          </div>
        )}
        {target !== '' && (
          <div style={mutedStyle}>
            {t('target')}:
            <div className="wt-dialog-path" style={{ marginTop: 2 }}>{target}</div>
          </div>
        )}
        {issue !== null && <div style={dangerStyle}>{t(issue)}</div>}
        {error !== '' && <div style={dangerStyle}>{error}</div>}
      </div>
    </Modal>
  )
}

function WorktreeButton({ sessionId, useSessions, useWorkspaces, t, createWorktree }: CreateButtonProps) {
  const summary = useSessions(state => state.byId[sessionId])
  const cwd = summary?.cwd
  const workspaceId = useWorkspaces(state => state.items.find(item => item.sessionIds.includes(sessionId))?.workspaceId)
  const [repo, setRepo] = useState<ProbeFact | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<{ seq: number; text: string } | null>(null)
  const busy = useRef(false)

  // A session switch must not leave the previous session's dialog open.
  useEffect(() => {
    setOpen(false)
  }, [cwd])

  const openDialog = async () => {
    if (cwd === undefined || busy.current)
      return
    busy.current = true
    try {
      const info = await probeRepo(cwd)
      if (info.gitMissing === true) {
        setError({ seq: Date.now(), text: t('gitMissing') })
        return
      }
      if (info.isRepo !== true) {
        setError({ seq: Date.now(), text: t('notRepo') })
        return
      }
      setRepo(info)
      setOpen(true)
    }
    catch (failure) {
      setError({ seq: Date.now(), text: errorText(failure) })
    }
    finally {
      busy.current = false
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        title={t('buttonTitle')}
        aria-label={t('buttonTitle')}
        icon={<IconBranchVerticalRegular size={16} />}
        style={{ width: 28, minWidth: 28, padding: 0, flex: 'none' }}
        onClick={() => { void openDialog() }}
      />
      {open && repo !== null && cwd !== undefined && (
        <CreateWorktreeDialog
          cwd={cwd}
          initial={repo}
          t={t}
          createWorktree={createWorktree}
          onClose={() => setOpen(false)}
          onDeleteCurrent={() => {
            setOpen(false)
            openDeleteRequest(sessionId, summary?.displayTitle ?? '', workspaceId)
          }}
        />
      )}
      {error !== null && (
        <Toast key={error.seq} text={error.text} holdMs={4000} onDone={() => setError(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Delete worktree (session row menu + shell overlay)
// ---------------------------------------------------------------------------

interface DeleteRequest {
  sessionId: string
  displayTitle: string
  workspaceId: WorkspaceId | undefined
  seq: number
}

let deleteRequest: DeleteRequest | null = null
let deleteSeq = 0
const deleteListeners = new Set<() => void>()

function notifyDelete(): void {
  for (const listener of deleteListeners)
    listener()
}

function subscribeDelete(listener: () => void): () => void {
  deleteListeners.add(listener)
  return () => { deleteListeners.delete(listener) }
}

function getDeleteRequest(): DeleteRequest | null {
  return deleteRequest
}

function openDeleteRequest(sessionId: string, displayTitle: string, workspaceId: WorkspaceId | undefined): void {
  deleteSeq += 1
  deleteRequest = { sessionId, displayTitle, workspaceId, seq: deleteSeq }
  notifyDelete()
}

function closeDeleteRequest(): void {
  deleteRequest = null
  notifyDelete()
}

interface DeleteMenuActions {
  requestDelete: (sessionId: string, displayTitle: string, workspaceId: WorkspaceId | undefined) => void
}

type DeleteMenuProps =
  & PropsRuntime<'sidebar.workspaces.session.menu.item'>
  & PropsLocale<typeof NS>
  & InjectFace<DeleteMenuActions>

function DeleteWorktreeMenuItem({ sessionId, displayTitle, useMenuOpenState, useWorkspaces, t, requestDelete }: DeleteMenuProps) {
  const workspaceId = useWorkspaces(state => state.items.find(item => item.sessionIds.includes(sessionId))?.workspaceId)

  const [, setMenuOpen] = useMenuOpenState()

  return (
    <MenuItemButton
      danger
      separatorBefore
      icon={<IconTrashOutlineRegular size={14} />}
      onSelect={() => {
        setMenuOpen(false)
        requestDelete(sessionId, displayTitle, workspaceId)
      }}
    >
      {t('deleteMenu')}
    </MenuItemButton>
  )
}

interface DeleteActions {
  deleteWorktree: (input: { sessionId: string; workspaceId: string; path: string }) => Promise<void>
}

type DeleteOverlayProps =
  & PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & InjectFace<DeleteActions>

function DeleteWorktreeOverlay({ useSessions, useWorkspaces, t, deleteWorktree }: DeleteOverlayProps) {
  const pending = useSyncExternalStore(subscribeDelete, getDeleteRequest)
  const session = useSessions(state => (pending === null ? undefined : state.byId[pending.sessionId as SessionId]))
  const workspace = useWorkspaces(state => (pending === null
    ? undefined
    : state.items.find(item => item.sessionIds.includes(pending.sessionId as SessionId))))
  const [toast, setToast] = useState<{ seq: number; text: string; tone?: 'success' } | null>(null)

  const skip = (text: string) => {
    closeDeleteRequest()
    setToast({ seq: Date.now(), text })
  }

  return (
    <>
      {pending !== null && (
        <DeleteWorktreeGate
          key={pending.seq}
          pending={pending}
          cwd={session?.cwd}
          workspaceId={pending.workspaceId ?? workspace?.workspaceId}
          sessionIds={workspace?.sessionIds ?? []}
          t={t}
          deleteWorktree={deleteWorktree}
          onClose={closeDeleteRequest}
          onSkip={skip}
          onDone={text => {
            closeDeleteRequest()
            setToast({ seq: Date.now(), text, tone: 'success' })
          }}
        />
      )}
      {toast !== null && (
        <Toast key={toast.seq} text={toast.text} tone={toast.tone} holdMs={4000} onDone={() => setToast(null)} />
      )}
    </>
  )
}

/**
 * Decide whether the request is actionable before opening the warning dialog:
 * a main checkout or a missing git binary produces a toast, not a dialog.
 */
function DeleteWorktreeGate(props: {
  pending: DeleteRequest
  cwd: string | undefined
  workspaceId: WorkspaceId | undefined
  sessionIds: readonly SessionId[]
  t: DeleteOverlayProps['t']
  deleteWorktree: DeleteActions['deleteWorktree']
  onClose: () => void
  onSkip: (text: string) => void
  onDone: (text: string) => void
}) {
  const [ready, setReady] = useState(false)
  const cwd = useRef(props.cwd).current
  const workspaceId = useRef(props.workspaceId).current

  useEffect(() => {
    let alive = true
    if (cwd === undefined) {
      props.onSkip(props.t('notWorktree'))
      return () => { alive = false }
    }
    probeRepo(cwd)
      .then(info => {
        if (!alive)
          return
        if (info.gitMissing === true) {
          props.onSkip(props.t('gitMissing'))
          return
        }
        if (info.isRepo !== true || info.isLinkedWorktree !== true) {
          props.onSkip(props.t('notWorktree'))
          return
        }
        setReady(true)
      })
      .catch(failure => {
        if (alive)
          props.onSkip(errorText(failure))
      })
    return () => { alive = false }
  }, [cwd])

  if (!ready)
    return null

  return (
    <DeleteWorktreeDialog
      pending={props.pending}
      cwd={cwd}
      workspaceId={workspaceId}
      sessionIds={props.sessionIds}
      t={props.t}
      deleteWorktree={props.deleteWorktree}
      onClose={props.onClose}
      onDone={props.onDone}
    />
  )
}

function DeleteWorktreeDialog(props: {
  pending: DeleteRequest
  cwd: string | undefined
  workspaceId: WorkspaceId | undefined
  sessionIds: readonly SessionId[]
  t: DeleteOverlayProps['t']
  deleteWorktree: DeleteActions['deleteWorktree']
  onClose: () => void
  onDone: (text: string) => void
}) {
  const { t } = props
  const [facts, setFacts] = useState<InspectFact | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    if (props.cwd === undefined)
      return () => { alive = false }
    inspectOnDisk(props.cwd)
      .then(next => { if (alive) setFacts(next) })
      .catch(failure => { if (alive) setError(errorText(failure)) })
    return () => { alive = false }
  }, [props.cwd])

  const confirm = async () => {
    if (facts === null || props.workspaceId === undefined || busy)
      return
    setBusy(true)
    setError('')
    try {
      await props.deleteWorktree({
        sessionId: props.pending.sessionId,
        workspaceId: props.workspaceId,
        path: facts.path,
      })
      props.onDone(t('deleted', { path: facts.path }))
    }
    catch (failure) {
      const message = messageOf(failure)
      setError(message === 'running' || message.includes('session-active')
        ? t('running')
        : message === 'workspace-missing'
          ? t('workspaceMissing')
          : errorText(failure))
      setBusy(false)
    }
  }

  const close = () => {
    if (!busy)
      props.onClose()
  }

  return (
    <Modal
      open
      className="wt-dialog"
      title={t('deleteTitle')}
      closeLabel={t('close')}
      onClose={close}
      footer={(
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>{t('cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => { void confirm() }}
            disabled={facts === null || props.workspaceId === undefined || busy}
          >
            {busy ? t('deleting') : t('confirmDelete')}
          </Button>
        </>
      )}
    >
      <div className="wt-dialog-body" style={{ fontSize: 13, lineHeight: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, minWidth: 0 }}>
          <IconBranchVerticalRegular size={14} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {facts === null ? t('reading') : (facts.branch !== '' ? facts.branch : t('detachedHead'))}
          </span>
        </div>
        <p style={{ ...dangerStyle, fontSize: 13 }}>{t('deleteWarning')}</p>
        <ul className="wt-dialog-list">
          <li>{t('willArchive', { count: props.sessionIds.length })}</li>
          <li>{t('willRemoveWorkspace')}</li>
          <li>
            {t('willRemoveDir')}
            <div className="wt-dialog-path" style={{ marginTop: 2 }}>{facts?.path ?? props.cwd ?? ''}</div>
          </li>
          {facts !== null && facts.dirty > 0 && (
            <li style={dangerStyle}>{t('dirty', { count: facts.dirty })}</li>
          )}
          {facts !== null && facts.ahead !== null && facts.ahead > 0 && (
            <li>{t('ahead', { count: facts.ahead })}</li>
          )}
          {facts !== null && facts.branch !== '' && (
            <li>{t('branchKept', { branch: facts.branch })}</li>
          )}
        </ul>
        {error !== '' && <div style={dangerStyle}>{error}</div>}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Plugin body
// ---------------------------------------------------------------------------

function fail(prefix: string, failure: unknown, path: string): Error {
  return new Error(`${prefix}${errorText(failure)}（路径：${path}）`)
}

export function apply(ctx: Context) {
  ensureStyle()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'simple-worktree: dictionaries')

  const createWorktree = async (input: { path: string; mode: 'new' | 'existing'; branch: string; base?: string }) => {
    const created = await createOnDisk(input)
    let workspace
    try {
      workspace = await ctx.workspaces.create({ path: created.path })
    }
    catch (failure) {
      throw fail('worktree 已创建，但注册工作区失败：', failure, created.path)
    }
    try {
      ctx.uiWorkspace.startSession(workspace.workspaceId)
    }
    catch (failure) {
      throw fail('工作区已注册，但新建会话失败：', failure, created.path)
    }
    return created
  }

  const deleteWorktree = createDeleteWorktree(ctx, removeOnDisk)

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'simple-worktree.create',
    order: 6,
    locale: NS,
    inject: (): CreateActions => ({ createWorktree }),
  }, WorktreeButton))

  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item',
    id: 'simple-worktree.delete',
    order: 500,
    locale: NS,
    inject: (): DeleteMenuActions => ({ requestDelete: openDeleteRequest }),
  }, DeleteWorktreeMenuItem))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'simple-worktree.delete-dialog',
    order: 0,
    locale: NS,
    inject: (): DeleteActions => ({ deleteWorktree }),
  }, DeleteWorktreeOverlay))
}
