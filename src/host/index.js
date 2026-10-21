/**
 * @voltage12/dsh-simple-worktree host half.
 *
 * Pure git/filesystem work behind four JSON routes under
 * `/plugin/simple-worktree`; the browser half owns every UI decision. The
 * module deliberately has no runtime dependency beyond Node builtins so the
 * host bundle stays small and the git logic can be exercised by a plain node
 * script.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'

export const name = 'simple-worktree'
export const inject = []

/** Absolute pathname prefix every route of this plugin lives under. */
export const ROUTE_PREFIX = '/plugin/simple-worktree'

const BODY_LIMIT = 64 * 1024
const MAX_SLOT_ATTEMPTS = 200

/** Run one git command with an argument vector (never a shell string). */
function runGit(cwd, args) {
  return new Promise(resolvePromise => {
    let child
    try {
      child = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolvePromise({
        ok: false,
        code: -1,
        missing: error?.code === 'ENOENT',
        stdout: '',
        stderr: String(error?.message ?? error),
      })
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => {
      resolvePromise({
        ok: false,
        code: -1,
        missing: error?.code === 'ENOENT',
        stdout,
        stderr: String(error?.message ?? error),
      })
    })
    child.on('close', code => {
      resolvePromise({ ok: code === 0, code: code ?? -1, stdout, stderr })
    })
  })
}

/** Case-folded absolute-path comparison (Windows paths are case-insensitive). */
function samePath(left, right) {
  const a = resolve(left)
  const b = resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** First non-empty stderr line, the part a dialog can show without the stack. */
function firstLine(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.length > 0) ?? ''
}

/** Turn git's stderr into one readable sentence. */
function gitMessage(result, fallback) {
  const line = firstLine(result.stderr)
  return line.length > 0 ? line.replace(/^(fatal|error):\s*/i, '') : fallback
}

/**
 * Translate the git failures this plugin can provoke; unknown details keep the
 * original line so a report can still be compared with git's own output.
 */
function friendlyGitMessage(result, fallback) {
  const raw = String(result?.stderr ?? '')
  if (/already checked out at/i.test(raw))
    return '该分支已被其他 worktree 检出'
  if (/is a missing but already registered worktree/i.test(raw))
    return '该目录已被 git 登记为 worktree，请先执行 git worktree prune'
  if (/contains modified or untracked files/i.test(raw))
    return 'worktree 内有未提交的改动，无法删除'
  if (/is locked/i.test(raw))
    return 'worktree 已被锁定，无法删除'
  if (/invalid reference/i.test(raw))
    return '分支或提交不存在'
  if (/not a git repository/i.test(raw))
    return '当前目录不是 Git 仓库'
  if (/permission denied/i.test(raw))
    return '没有权限访问该目录'
  const line = firstLine(raw)
  return line.length > 0 ? `${fallback}：${line}` : fallback
}

/** Require an absolute directory path from the request body. */
async function requireDirectory(value) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error('缺少目录参数')
  if (!isAbsolute(value))
    throw new Error(`目录必须是绝对路径：${value}`)
  let info
  try {
    info = await stat(value)
  } catch {
    throw new Error(`目录不存在：${value}`)
  }
  if (!info.isDirectory())
    throw new Error(`不是目录：${value}`)
  return resolve(value)
}

/** Branch names git considers checked out, mapped to their worktree directory. */
async function checkedOutBranches(top) {
  const result = await runGit(top, ['worktree', 'list', '--porcelain'])
  const map = new Map()
  if (!result.ok)
    return map
  let current = ''
  for (const raw of result.stdout.split(/\r?\n/)) {
    if (raw.startsWith('worktree ')) {
      current = raw.slice('worktree '.length)
    }
    else if (raw.startsWith('branch refs/heads/')) {
      map.set(raw.slice('branch refs/heads/'.length), current)
    }
  }
  return map
}

/** Local branch refs in git's order. */
async function localBranches(top) {
  const result = await runGit(top, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
  if (!result.ok)
    return []
  return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

/**
 * Resolve one directory's git identity.
 * @param {string} directory absolute directory to inspect.
 */
async function probe(directory) {
  const dir = await requireDirectory(directory)
  const inside = await runGit(dir, ['rev-parse', '--is-inside-work-tree'])
  if (!inside.ok) {
    if (inside.missing === true)
      return { isRepo: false, gitMissing: true, error: '未找到 git 命令，请先安装 Git 并加入 PATH' }
    return {
      isRepo: false,
      error: /not a git repository/i.test(String(inside.stderr))
        ? '当前目录不是 Git 仓库'
        : gitMessage(inside, '无法读取 Git 仓库信息'),
    }
  }

  const topResult = await runGit(dir, ['rev-parse', '--show-toplevel'])
  if (!topResult.ok)
    return { isRepo: false, error: gitMessage(topResult, '无法解析仓库根目录') }
  const top = normalize(topResult.stdout.trim())

  const gitDirResult = await runGit(dir, ['rev-parse', '--path-format=absolute', '--git-dir'])
  const commonDirResult = await runGit(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  let gitDir = gitDirResult.ok ? gitDirResult.stdout.trim() : ''
  let commonDir = commonDirResult.ok ? commonDirResult.stdout.trim() : ''
  if (gitDir === '' || commonDir === '') {
    const legacyGit = await runGit(dir, ['rev-parse', '--git-dir'])
    const legacyCommon = await runGit(dir, ['rev-parse', '--git-common-dir'])
    gitDir = legacyGit.ok ? legacyGit.stdout.trim() : gitDir
    commonDir = legacyCommon.ok ? legacyCommon.stdout.trim() : commonDir
  }
  if (gitDir !== '' && !isAbsolute(gitDir))
    gitDir = resolve(top, gitDir)
  if (commonDir !== '' && !isAbsolute(commonDir))
    commonDir = resolve(top, commonDir)

  const isLinkedWorktree = gitDir !== '' && commonDir !== '' && !samePath(gitDir, commonDir)
  const mainRoot = normalize(isLinkedWorktree ? dirname(commonDir) : top)

  const branchResult = await runGit(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  const branch = branchResult.ok ? branchResult.stdout.trim() : undefined
  const head = await runGit(dir, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  const outs = await checkedOutBranches(top)
  const names = await localBranches(top)
  const branches = names.map(branchName => ({
    name: branchName,
    worktreePath: outs.get(branchName) ?? null,
  }))

  return {
    isRepo: true,
    top,
    mainRoot,
    gitDir,
    commonDir,
    isLinkedWorktree,
    branch,
    hasCommits: head.ok,
    branches,
  }
}

/** Flatten a branch name into one directory segment: `feat/login` -> `feat-login`. */
function flattenBranch(branch) {
  return branch.split('/').join('-')
}

/** Pick the first free `<agents>/<slug>`, `<slug>-2`, ... directory. */
function pickSlot(agentsDir, slug) {
  for (let index = 1; index <= MAX_SLOT_ATTEMPTS; index += 1) {
    const candidate = join(agentsDir, index === 1 ? slug : `${slug}-${index}`)
    if (!existsSync(candidate))
      return candidate
  }
  throw new Error(`无法为 ${slug} 找到空闲目录名`)
}

/** Ensure the repository's `.gitignore` covers the worktree directory. */
async function ensureGitignore(repoRoot) {
  const file = join(repoRoot, '.gitignore')
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT')
      throw error
  }
  const covered = text.split(/\r?\n/).some(raw => {
    const line = raw.trim()
    return line === '.agents/worktree'
      || line === '.agents/worktree/'
      || line === '/.agents/worktree'
      || line === '/.agents/worktree/'
      || line === '.agents'
      || line === '.agents/'
      || line === '/.agents'
      || line === '/.agents/'
  })
  if (covered)
    return false
  const separator = text === '' || text.endsWith('\n') ? '' : '\n'
  await writeFile(file, `${text}${separator}.agents/worktree/\n`, 'utf8')
  return true
}

/** Validate a branch name through git's own ref-name rules. */
async function assertBranchName(repoRoot, branch) {
  const result = await runGit(repoRoot, ['check-ref-format', '--branch', branch])
  if (!result.ok)
    throw new Error(`分支名不合法：${branch}`)
}

/** Create the worktree for one branch and return its directory. */
async function createWorktree(body) {
  const target = await probe(body?.path)
  if (target.gitMissing === true)
    throw new Error('未找到 git 命令，请先安装 Git 并加入 PATH')
  if (!target.isRepo)
    throw new Error(target.error ?? '当前目录不是 Git 仓库')
  if (!target.hasCommits)
    throw new Error('仓库还没有任何提交，无法创建 worktree')

  const mode = body?.mode === 'existing' ? 'existing' : 'new'
  const branch = String(body?.branch ?? '').trim()
  if (branch === '')
    throw new Error('请输入分支名')
  await assertBranchName(target.mainRoot, branch)

  const existing = target.branches.find(item => item.name === branch)
  if (mode === 'new') {
    if (existing !== undefined)
      throw new Error(`本地已存在分支 ${branch}`)
  }
  else {
    if (existing === undefined)
      throw new Error(`本地不存在分支 ${branch}`)
    if (existing.worktreePath !== null && existing.worktreePath !== '')
      throw new Error(`分支 ${branch} 已被 worktree 占用：${existing.worktreePath}`)
  }

  let base = 'HEAD'
  if (mode === 'new') {
    const requested = String(body?.base ?? '').trim()
    base = requested === '' ? (target.branch ?? 'HEAD') : requested
    if (base !== 'HEAD' && !target.branches.some(item => item.name === base))
      throw new Error(`起点分支不存在：${base}`)
  }

  const agentsDir = join(target.mainRoot, '.agents', 'worktree')
  await mkdir(agentsDir, { recursive: true })
  await ensureGitignore(target.mainRoot)
  const directory = pickSlot(agentsDir, flattenBranch(branch))

  // A stale registration pointing at a vanished directory would otherwise make
  // `worktree add` refuse the new slot; pruning first is safe and local.
  await runGit(target.mainRoot, ['worktree', 'prune'])

  const args = mode === 'new'
    ? ['worktree', 'add', '-b', branch, directory, base]
    : ['worktree', 'add', directory, branch]
  const result = await runGit(target.mainRoot, args)
  if (!result.ok) {
    if (mode === 'new') {
      // `-b` may have created the ref before the checkout failed; leave no
      // half-made branch behind (it did not exist a moment ago).
      await runGit(target.mainRoot, ['branch', '-D', branch])
    }
    await runGit(target.mainRoot, ['worktree', 'prune'])
    throw new Error(friendlyGitMessage(result, '创建 worktree 失败'))
  }

  return {
    path: directory,
    branch,
    repoRoot: target.mainRoot,
    created: true,
  }
}

/** Pre-delete facts for the warning dialog. */
async function inspectWorktree(body) {
  const target = await probe(body?.path)
  if (target.gitMissing === true)
    throw new Error('未找到 git 命令，请先安装 Git 并加入 PATH')
  if (!target.isRepo)
    throw new Error(target.error ?? '当前目录不是 Git 仓库')
  if (!target.isLinkedWorktree)
    throw new Error('当前会话不在 worktree 中')

  const status = await runGit(target.top, ['status', '--porcelain'])
  const dirty = status.ok ? status.stdout.split(/\r?\n/).filter(line => line.trim() !== '').length : 0
  const upstream = await runGit(target.top, ['rev-list', '--count', '@{upstream}..HEAD'])
  const ahead = upstream.ok ? Number.parseInt(upstream.stdout.trim(), 10) || 0 : null

  return {
    path: target.top,
    branch: target.branch ?? '',
    dirty,
    ahead,
    repoRoot: target.mainRoot,
  }
}

/** Remove one linked worktree (registration + directory); the branch stays. */
async function removeWorktree(body) {
  const target = await probe(body?.path)
  if (target.gitMissing === true)
    throw new Error('未找到 git 命令，请先安装 Git 并加入 PATH')
  if (!target.isRepo)
    throw new Error(target.error ?? '当前目录不是 Git 仓库')
  if (!target.isLinkedWorktree)
    throw new Error('当前会话不在 worktree 中')
  if (samePath(target.top, target.mainRoot))
    throw new Error('不能删除主仓库的工作目录')

  const force = body?.force === true
  const result = await runGit(target.mainRoot, [
    'worktree',
    'remove',
    ...(force ? ['--force'] : []),
    target.top,
  ])

  if (!result.ok) {
    // A locked/broken registration still owns the directory; drop the admin
    // entry and remove the folder so the user's explicit delete lands.
    await runGit(target.mainRoot, ['worktree', 'unlock', target.top])
    await runGit(target.mainRoot, ['worktree', 'prune'])
    if (existsSync(target.top))
      await rm(target.top, { recursive: true, force: true })
    await runGit(target.mainRoot, ['worktree', 'prune'])
    if (existsSync(target.top))
      throw new Error(friendlyGitMessage(result, '删除 worktree 失败'))
  }

  if (existsSync(target.top))
    await rm(target.top, { recursive: true, force: true })
  await runGit(target.mainRoot, ['worktree', 'prune'])

  return {
    removed: true,
    path: target.top,
    branch: target.branch ?? '',
  }
}

/** Read and JSON-parse one bounded request body. */
function readJson(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        req.destroy()
        rejectPromise(new Error('请求体过大'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolvePromise({})
        return
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      }
      catch (error) {
        rejectPromise(new Error(`请求体不是合法 JSON：${error?.message ?? error}`))
      }
    })
    req.on('error', rejectPromise)
  })
}

/** Send one JSON reply (repo facts are point-in-time, never cached). */
function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/**
 * Plugin apply: mount the four routes on any webServer that comes and goes.
 * @param ctx host cordis context.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], webCtx => {
    const get = (path, handler) => {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path,
        handler: async (req, res) => {
          try {
            const query = new URL(req.url ?? '/', 'http://x').searchParams
            send(res, 200, await handler(query))
          }
          catch (error) {
            send(res, 400, { error: error instanceof Error ? error.message : String(error) })
          }
        },
      }), `simple-worktree: ${path} route`)
    }

    const post = (path, handler) => {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path,
        handler: async (req, res) => {
          try {
            send(res, 200, await handler(await readJson(req)))
          }
          catch (error) {
            send(res, 400, { error: error instanceof Error ? error.message : String(error) })
          }
        },
      }), `simple-worktree: ${path} route`)
    }

    get(`${ROUTE_PREFIX}/probe`, query => probe(query.get('path') ?? ''))
    post(`${ROUTE_PREFIX}/create`, body => createWorktree(body))
    post(`${ROUTE_PREFIX}/inspect`, body => inspectWorktree(body))
    post(`${ROUTE_PREFIX}/remove`, body => removeWorktree(body))
  })
}

export { createWorktree, inspectWorktree, probe, removeWorktree }
