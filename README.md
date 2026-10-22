# @voltage12/dsh-simple-worktree

DSH Web 插件（非官方）：在会话输入框工具行一键创建 git worktree，并在会话「…」菜单里把它连同工作区一起收掉。

![创建 worktree](https://cdn.jsdelivr.net/gh/voltage12/dsh-simple-worktree@main/docs/create-dialog.png)

## 功能

### 新建 Worktree

- 入口在 `conversation.input.left`（模型选择、权限预设那一排），是一个无底色、28×28 的分支图标按钮。
- 按钮旁显示当前 Session 的 Git 分支名；每 5 秒刷新一次。Session 不在 Git 仓库中或处于 detached HEAD 时不显示。
- 按钮始终可点；当前会话目录不是 git 仓库、或系统里找不到 git 命令时，点击只弹出一条提示，不会打开创建窗口。
- 弹窗两个互斥选项：
  - **新建分支**（默认）：分支名输入框 + 「基于分支」下拉框（默认当前分支）。
  - **已有分支**：列出全部本地分支，无默认；已被其他 worktree 检出的分支置灰并标注。
- 创建位置固定为**主仓库根目录** `<repo>/.agents/worktree/<分支名>`，分支名里的 `/` 拍平成 `-`。
- 目录重名自动加 `-2`、`-3`… 后缀；分支重名直接报错。
- 自动创建 `.agents/worktree/` 目录，并确保仓库根 `.gitignore` 含 `.agents/worktree/`。
- 创建成功后注册为 Workspace，在其中新建 Session 并自动激活。
- 如果当前会话本身就在 worktree 中（不是主仓库），弹窗底部会多出「删除当前 Worktree」；它与「…」菜单里的「删除 Worktree」走**完全相同**的确认、归档、注销、删除流程。
- git 失败时弹窗保留、显示原始错误，可改名重试。

![弹窗内删除当前 Worktree](https://cdn.jsdelivr.net/gh/voltage12/dsh-simple-worktree@main/docs/create-dialog-worktree.png)

### 删除 Worktree

- 入口在侧边栏会话行的「…」菜单：`sidebar.workspaces.session.menu.item`。
- **常驻显示**：主仓库会话也会出现；不在 worktree 中时点击只弹提示，不执行删除。
- 弹窗会列出：
  - 该工作区下将被归档的会话数（含当前会话）；
  - workspace 注册将被移除；
  - worktree 目录（未提交改动会丢失）；
  - 未提交改动数、未推送提交数；
  - 分支会保留。
- 确认后按顺序执行：`git worktree remove --force` → 归档会话 → 注销 Workspace。Git 拒绝删除或目录仍存在时停止，不会自动解锁、prune 或递归强删目录，也不会改变 Workspace / Session 状态。
- 磁盘删除成功后若归档或注销失败，会尝试恢复本次归档的会话（保留原已归档会话），保留弹窗供重试；当前插件实例记住已完成的磁盘删除，重试不会再次删除同一路径。刷新或重启后该进度不保留，需手动检查目录及工作区注册；不会根据目录缺失擅自认定删除成功。
- 异步步骤间重新检查会话运行状态及工作区成员；发生变化时停止清理并显示错误。跨 Git 与 DSH 的操作不是原子事务，无法恢复 Git 已删除的文件。
- 有会话正在运行时拒绝删除并提示。
- 分支**不会**被删除。

> DSH 的会话只能归档、不能物理删除；这里的“删除会话”即归档。

![删除确认](https://cdn.jsdelivr.net/gh/voltage12/dsh-simple-worktree@main/docs/delete-dialog.png)

## 安装

```sh
dsh plugin --profile desktop add @voltage12/dsh-simple-worktree
```

插件声明了 `dsh.bundle`，`dsh plugin add` 会把它加进 profile 的 bundles 列表。**装完需要重启 DeepSeek Harness**（host 半边在启动时组合）。

如果 npm 镜像尚未同步到新版本，可以临时指定官方源：

```sh
dsh plugin --profile desktop add @voltage12/dsh-simple-worktree --registry=https://registry.npmjs.org/
```

卸载：

```sh
dsh plugin --profile desktop remove @voltage12/dsh-simple-worktree
```

## 兼容性

- 实测 DSH `0.2.1-rc.2`。
- 插件通过 `engines.dsh` 声明兼容范围 `>=0.2.1-rc.2 <0.3.0`。DSH 在安装和启动前会做兼容性检查，不匹配时会禁用该插件并提示，而不是直接崩溃。
- DSH 升级后请重新验证；如需放宽范围，会随插件新版本发布。
- 界面文案固定中文（中英文字典内容一致），不跟随应用语言切换。

## 安全说明

这是一个**非官方**插件，host 半边会：

- 调用 PATH 中的 `git` 命令；
- 在仓库根目录创建 `.agents/worktree/` 并修改仓库的 `.gitignore`；
- 在删除流程中移除 worktree 目录；
- 注册 `/plugin/simple-worktree/*` 下的本地 HTTP 路由。

只应在你信任的 DSH 安装中启用。不要把 DSH 的 Web 服务直接暴露到不可信网络；如果通过反向代理或隧道对外提供访问，请先确认 DSH 自身的访问控制。

## 开发

```sh
pnpm install
pnpm test          # 临时 Git 仓库及故障注入回归测试
pnpm build         # lib/index.js (host) + lib/client.js (web client)
pnpm typecheck
pnpm pack          # 发布前构建并检查 tarball
```

- host 半：`src/host/index.js`，四条 `/plugin/simple-worktree/*` 路由（probe/create/inspect/remove），只依赖 Node 内置模块。
- client 半：`src/client/index.tsx`，由 esbuild 打成 DSH 的 `window.__ModuleLoader__.load({ id, factory })` 结构；模块 id 直接取 `package.json` 的包名。
- `lib/` 是构建产物；改 client 后重启进程或刷新页面，改 host 后需要重启宿主。

## 已知边界

- worktree 只包含已提交内容，当前未提交改动不会带过去。
- workspace/session 注册失败时不回滚已经建好的 worktree，会报错并给出路径。
- 目录名冲突后缀最多尝试 200 次。
- **git 以「分支」为单位判断占用，不看 commit**：两个不同分支指向同一个 commit 时，各自都可以有 worktree；只有同一个分支已被某个 worktree 检出时才会被拒绝（git 自身也拒绝）。「新建分支」模式要求分支名尚不存在；如果要为已存在的分支建 worktree，请用「已有分支」模式。
- 插件依赖 PATH 中的 `git`；找不到 git 时，新建和删除两个入口点击后都会提示「未找到 git 命令」，不会静默失败。
- DSH 对还没有消息的 blank session 不渲染会话行「…」菜单，所以发第一条消息前看不到菜单里的「删除 Worktree」。但空白会话本身是真实存在的（有 session id、cwd 和持久化日志），可以先在新建弹窗底部用「删除当前 Worktree」删掉它。

## License

MIT
