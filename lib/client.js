window.__ModuleLoader__.load({
	id: "@voltage12/dsh-simple-worktree",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		"use strict";
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name2 in all)
		    __defProp(target, name2, { get: all[name2], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.tsx
		var index_exports = {};
		__export(index_exports, {
		  apply: () => apply,
		  inject: () => inject,
		  name: () => name
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/delete-worktree.ts
		function createDeleteWorktree(ctx, removeOnDisk2) {
		  const completed = /* @__PURE__ */ new Map();
		  const active = /* @__PURE__ */ new Set();
		  return async (input) => {
		    if (active.has(input.workspaceId))
		      throw new Error("\u5220\u9664\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
		    active.add(input.workspaceId);
		    const workspaceId = input.workspaceId;
		    const attempted = [];
		    const pinned = new Set(ctx.workspaces.list.getSnapshot().pinnedSessionIds);
		    try {
		      const workspace = ctx.workspaces.list.getSnapshot().items.find((item) => item.workspaceId === workspaceId);
		      if (workspace === void 0)
		        throw new Error("workspace-missing");
		      const previous = completed.get(workspaceId);
		      const ids = previous?.ids ?? [...workspace.sessionIds];
		      const workspacePath = previous?.workspacePath ?? workspace.path;
		      const cwds = previous?.cwds ?? new Map(ids.map((id) => [id, ctx.sessions.list.getSnapshot().byId[id]?.cwd]));
		      if (!ids.includes(input.sessionId) || previous !== void 0 && previous.path !== input.path)
		        throw new Error("\u5DE5\u4F5C\u533A\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u540E\u91CD\u8BD5");
		      const check = () => {
		        const current = ctx.workspaces.list.getSnapshot().items.find((item) => item.workspaceId === workspaceId);
		        if (current === void 0 || current.path !== workspacePath || current.sessionIds.length !== ids.length || ids.some((id) => !current.sessionIds.includes(id)))
		          throw new Error("\u5DE5\u4F5C\u533A\u5DF2\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62\u540E\u7EED\u6E05\u7406\uFF0C\u8BF7\u68C0\u67E5\u5DE5\u4F5C\u533A\u548C\u76EE\u5F55");
		        const sessions = ctx.sessions.list.getSnapshot().byId;
		        if (ids.some((id) => sessions[id] === void 0))
		          throw new Error("\u4F1A\u8BDD\u72B6\u6001\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
		        if (ids.some((id) => sessions[id]?.cwd !== cwds.get(id)))
		          throw new Error("\u4F1A\u8BDD\u76EE\u5F55\u5DF2\u53D8\u5316\uFF0C\u5DF2\u505C\u6B62\u540E\u7EED\u6E05\u7406\uFF0C\u8BF7\u68C0\u67E5\u5DE5\u4F5C\u533A\u548C\u76EE\u5F55");
		        if (ids.some((id) => sessions[id]?.running === true))
		          throw new Error("running");
		      };
		      check();
		      if (previous === void 0) {
		        const result = await removeOnDisk2({ path: input.path, force: true });
		        if (result.removed !== true || result.path !== input.path)
		          throw new Error("\u672A\u786E\u8BA4 worktree \u5220\u9664\u6210\u529F\uFF0C\u8BF7\u68C0\u67E5\u76EE\u5F55");
		        completed.set(workspaceId, { path: input.path, workspacePath, ids, cwds });
		      }
		      check();
		      for (const id of ids) {
		        if (ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(id))
		          continue;
		        attempted.push(id);
		        await ctx.uiWorkspace.archiveSession(id);
		        check();
		      }
		      await ctx.workspaces.delete(workspaceId);
		      completed.delete(workspaceId);
		    } catch (failure) {
		      const restoreErrors = [];
		      for (const id of attempted.reverse()) {
		        try {
		          if (ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(id)) {
		            await ctx.uiWorkspace.unarchiveSession(id);
		            if (pinned.has(id))
		              await ctx.workspaces.pinSession(id);
		          }
		        } catch {
		          restoreErrors.push(id);
		        }
		      }
		      if (completed.has(workspaceId) || restoreErrors.length > 0) {
		        const detail = failure instanceof Error ? failure.message : String(failure);
		        throw new Error(`${detail}\uFF1Bworktree \u78C1\u76D8\u5220\u9664\u5DF2\u5B8C\u6210\uFF0C\u5DE5\u4F5C\u533A\u6E05\u7406\u672A\u5B8C\u6210\uFF0C\u53EF\u5728\u5F53\u524D\u7A97\u53E3\u91CD\u8BD5\uFF08\u8DEF\u5F84\uFF1A${input.path}\uFF09` + (restoreErrors.length > 0 ? `\uFF1B\u8BF7\u68C0\u67E5\u5E76\u6062\u590D\u4F1A\u8BDD\u5F52\u6863/\u7F6E\u9876\u72B6\u6001\uFF1A${restoreErrors.join(", ")}` : ""));
		      }
		      throw failure;
		    } finally {
		      active.delete(input.workspaceId);
		    }
		  };
		}

		// src/client/index.tsx
		var import_react = require("react");
		var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		var import_jsx_runtime = require("react/jsx-runtime");
		function IconBranchVerticalRegular({ size = 16, className }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		    "svg",
		    {
		      width: size,
		      height: size,
		      className,
		      viewBox: "0 0 16 16",
		      fill: "none",
		      xmlns: "http://www.w3.org/2000/svg",
		      "aria-hidden": "true",
		      stroke: "currentColor",
		      strokeWidth: 1,
		      strokeLinecap: "round",
		      strokeLinejoin: "round",
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "4.5", cy: "3", r: "1.5" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "4.5", cy: "13", r: "1.5" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "5", r: "1.5" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4.5 4.5v7" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4.5 8h5.5c1.105 0 2-.895 2-1.5" })
		      ]
		    }
		  );
		}
		var name = "simple-worktree";
		var inject = ["slots", "sessions", "workspaces", "uiWorkspace", "locale"];
		var ROUTE_PREFIX = "/plugin/simple-worktree";
		var NS = "simpleWorktree";
		var zh = {
		  button: "Worktree",
		  buttonTitle: "\u65B0\u5EFA Worktree",
		  checking: "\u6B63\u5728\u68C0\u67E5 Git \u4ED3\u5E93\u2026",
		  notRepo: "\u5F53\u524D\u76EE\u5F55\u4E0D\u662F Git \u4ED3\u5E93",
		  gitMissing: "\u672A\u627E\u5230 git \u547D\u4EE4\uFF0C\u8BF7\u5148\u5B89\u88C5 Git \u5E76\u52A0\u5165 PATH",
		  createTitle: "\u65B0\u5EFA Worktree",
		  modeNew: "\u65B0\u5EFA\u5206\u652F",
		  modeExisting: "\u5DF2\u6709\u5206\u652F",
		  branchName: "\u5206\u652F\u540D",
		  branchNamePlaceholder: "\u4F8B\u5982 feat/login",
		  baseBranch: "\u57FA\u4E8E\u5206\u652F",
		  chooseBranch: "\u8BF7\u9009\u62E9\u5206\u652F",
		  occupied: "\u5DF2\u88AB worktree \u5360\u7528",
		  target: "\u5C06\u521B\u5EFA\u5230",
		  cancel: "\u53D6\u6D88",
		  create: "\u521B\u5EFA",
		  creating: "\u521B\u5EFA\u4E2D\u2026",
		  close: "\u5173\u95ED",
		  invalidEmpty: "\u8BF7\u8F93\u5165\u5206\u652F\u540D",
		  invalidName: "\u5206\u652F\u540D\u4E0D\u5408\u6CD5",
		  invalidExists: "\u672C\u5730\u5DF2\u5B58\u5728\u540C\u540D\u5206\u652F\uFF0C\u5982\u9700\u4E3A\u5B83\u521B\u5EFA worktree \u8BF7\u6539\u7528\u300C\u5DF2\u6709\u5206\u652F\u300D",
		  invalidSame: "\u8D77\u70B9\u4E0D\u80FD\u4E0E\u5206\u652F\u540D\u76F8\u540C",
		  loadFailed: "\u8BFB\u53D6\u4ED3\u5E93\u4FE1\u606F\u5931\u8D25",
		  deleteMenu: "\u5220\u9664 Worktree",
		  deleteCurrent: "\u5220\u9664\u5F53\u524D Worktree",
		  deleteTitle: "\u5220\u9664 Worktree",
		  deleteWarning: "\u6B64\u64CD\u4F5C\u4F1A\u5220\u9664 worktree \u76EE\u5F55\uFF0C\u672A\u63D0\u4EA4\u7684\u6539\u52A8\u5C06\u6C38\u4E45\u4E22\u5931\u3002",
		  willArchive: "\u8BE5\u5DE5\u4F5C\u533A\u4E0B\u7684 {count} \u4E2A\u4F1A\u8BDD\u5C06\u88AB\u5F52\u6863\uFF08\u542B\u5F53\u524D\u4F1A\u8BDD\uFF09",
		  willRemoveWorkspace: "\u5DE5\u4F5C\u533A\u6CE8\u518C\u5C06\u88AB\u79FB\u9664",
		  willRemoveDir: "worktree \u76EE\u5F55\u5C06\u88AB\u5220\u9664\uFF1A",
		  dirty: "{count} \u4E2A\u672A\u63D0\u4EA4\u6539\u52A8",
		  ahead: "{count} \u4E2A\u672A\u63A8\u9001\u63D0\u4EA4",
		  branchKept: "\u5206\u652F {branch} \u4F1A\u4FDD\u7559\uFF0C\u4E0D\u4F1A\u88AB\u5220\u9664",
		  confirmDelete: "\u786E\u8BA4\u5220\u9664",
		  deleting: "\u5220\u9664\u4E2D\u2026",
		  reading: "\u8BFB\u53D6\u4E2D\u2026",
		  detachedHead: "\u6E38\u79BB HEAD",
		  notWorktree: "\u5F53\u524D\u4F1A\u8BDD\u4E0D\u5728 worktree \u4E2D",
		  running: "\u8BE5\u5DE5\u4F5C\u533A\u8FD8\u6709\u4F1A\u8BDD\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u5148\u505C\u6B62\u540E\u518D\u5220\u9664",
		  workspaceMissing: "\u627E\u4E0D\u5230\u8BE5\u4F1A\u8BDD\u6240\u5C5E\u7684\u5DE5\u4F5C\u533A",
		  deleted: "\u5DF2\u5220\u9664 Worktree\uFF1A{path}",
		  workspaceFailed: "worktree \u5DF2\u521B\u5EFA\uFF0C\u4F46\u6CE8\u518C\u5DE5\u4F5C\u533A\u5931\u8D25\uFF1A",
		  sessionFailed: "\u5DE5\u4F5C\u533A\u5DF2\u6CE8\u518C\uFF0C\u4F46\u65B0\u5EFA\u4F1A\u8BDD\u5931\u8D25\uFF1A"
		};
		var en = zh;
		async function request(method, path, body, query) {
		  const search = query === void 0 ? "" : `?${new URLSearchParams(query).toString()}`;
		  const response = await fetch(`${ROUTE_PREFIX}${path}${search}`, {
		    method,
		    cache: "no-store",
		    headers: body === void 0 ? void 0 : { "content-type": "application/json" },
		    body: body === void 0 ? void 0 : JSON.stringify(body)
		  });
		  const data = await response.json().catch(() => ({}));
		  if (!response.ok)
		    throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${response.status}`);
		  return data;
		}
		function probeRepo(path) {
		  return request("GET", "/probe", void 0, { path });
		}
		function getSessionBranch(path) {
		  return request("GET", "/branch", void 0, { path });
		}
		function createOnDisk(input) {
		  return request("POST", "/create", input);
		}
		function inspectOnDisk(path) {
		  return request("POST", "/inspect", { path });
		}
		function removeOnDisk(input) {
		  return request("POST", "/remove", input);
		}
		function messageOf(error) {
		  return error instanceof Error ? error.message : String(error);
		}
		function errorText(error) {
		  const raw = messageOf(error);
		  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw))
		    return "\u65E0\u6CD5\u8FDE\u63A5\u63D2\u4EF6\u670D\u52A1\uFF0C\u8BF7\u91CD\u542F\u5E94\u7528\u540E\u91CD\u8BD5";
		  if (/enoent|command not found/i.test(raw) && /git/i.test(raw))
		    return "\u672A\u627E\u5230 git \u547D\u4EE4\uFF0C\u8BF7\u5148\u5B89\u88C5 Git \u5E76\u52A0\u5165 PATH";
		  if (/already checked out at/i.test(raw))
		    return "\u8BE5\u5206\u652F\u5DF2\u88AB\u5176\u4ED6 worktree \u68C0\u51FA";
		  if (/not a git repository/i.test(raw))
		    return "\u5F53\u524D\u76EE\u5F55\u4E0D\u662F Git \u4ED3\u5E93";
		  if (/is a missing but already registered worktree/i.test(raw))
		    return "\u8BE5\u76EE\u5F55\u5DF2\u88AB git \u767B\u8BB0\u4E3A worktree\uFF0C\u8BF7\u5148\u6267\u884C git worktree prune";
		  if (/contains modified or untracked files/i.test(raw))
		    return "worktree \u5185\u6709\u672A\u63D0\u4EA4\u7684\u6539\u52A8\uFF0C\u65E0\u6CD5\u5220\u9664";
		  if (/is locked/i.test(raw))
		    return "worktree \u5DF2\u88AB\u9501\u5B9A\uFF0C\u65E0\u6CD5\u5220\u9664";
		  if (/invalid reference/i.test(raw))
		    return "\u5206\u652F\u6216\u63D0\u4EA4\u4E0D\u5B58\u5728";
		  return raw;
		}
		function branchIssue(raw, branches, base, mode) {
		  const name2 = raw.trim();
		  if (name2 === "")
		    return "invalidEmpty";
		  if (mode === "new" && name2 === base)
		    return "invalidSame";
		  if (name2 === "@" || name2 === "HEAD")
		    return "invalidName";
		  if (name2.startsWith("-") || name2.endsWith("/") || name2.endsWith(".") || name2.endsWith(".lock"))
		    return "invalidName";
		  if (/[\s~^:?*[\\\u0000-\u001f]/.test(name2))
		    return "invalidName";
		  if (name2.includes("..") || name2.includes("@{") || name2.includes("//"))
		    return "invalidName";
		  const parts = name2.split("/");
		  if (parts.some((part) => part === "" || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock")))
		    return "invalidName";
		  if (mode === "new" && branches.some((branch) => branch.name === name2))
		    return "invalidExists";
		  return null;
		}
		function flatten(name2) {
		  return name2.split("/").join("-");
		}
		var STYLE = `
		.wt-dialog { width: min(460px, 100%) !important; }
		.wt-dialog-body { display: flex; flex-direction: column; gap: 14px; width: 100%; min-width: 0; box-sizing: border-box; }
		.wt-dialog-path { font-family: var(--dsh-font-mono, ui-monospace, monospace); overflow-wrap: anywhere; word-break: break-word; }
		.wt-dialog-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; overflow-wrap: anywhere; }
		`;
		function ensureStyle() {
		  if (typeof document === "undefined" || document.querySelector("style[data-simple-worktree-style]") !== null)
		    return;
		  const style = document.createElement("style");
		  style.setAttribute("data-simple-worktree-style", "");
		  style.textContent = STYLE;
		  document.head.appendChild(style);
		}
		var fieldStyle = {
		  display: "flex",
		  flexDirection: "column",
		  gap: 6,
		  fontSize: 13,
		  lineHeight: "20px"
		};
		var pickerStyle = {
		  display: "flex",
		  alignItems: "center",
		  justifyContent: "space-between",
		  gap: 8,
		  width: "100%",
		  minWidth: 0,
		  height: 34,
		  padding: "0 10px",
		  boxSizing: "border-box",
		  borderRadius: 8,
		  border: "1px solid var(--dsw-alias-line-2, rgba(128,128,128,.35))",
		  background: "var(--dsw-alias-bg-2, rgba(128,128,128,.08))",
		  color: "inherit",
		  fontSize: 13,
		  cursor: "pointer",
		  textAlign: "left"
		};
		var dangerStyle = {
		  color: "var(--dsw-alias-text-error, #e5484d)",
		  fontSize: 12,
		  lineHeight: "18px"
		};
		var mutedStyle = {
		  opacity: 0.65,
		  fontSize: 12,
		  lineHeight: "18px"
		};
		function BranchPicker(props) {
		  const [open, setOpen] = (0, import_react.useState)(false);
		  const selected = props.branches.find((branch) => branch.name === props.value);
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    import_dsh_client_ui_primitives.Menu,
		    {
		      open,
		      autoFocus: true,
		      dense: true,
		      portal: true,
		      align: "start",
		      side: "bottom",
		      onClose: () => setOpen(false),
		      anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "button",
		        {
		          type: "button",
		          "data-modal-autofocus": props.autoFocus === true ? "" : void 0,
		          style: pickerStyle,
		          onClick: () => setOpen((next) => !next),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: selected === void 0 ? props.placeholder : selected.name }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 12 })
		          ]
		        }
		      ),
		      items: props.branches.map((branch) => ({
		        id: branch.name,
		        label: props.disableOccupied && branch.worktreePath !== null ? `${branch.name}  \xB7  ${props.t("occupied")}` : branch.name,
		        disabled: props.disableOccupied && branch.worktreePath !== null
		      })),
		      onSelect: (id) => {
		        setOpen(false);
		        props.onSelect(id);
		      }
		    }
		  );
		}
		function CreateWorktreeDialog(props) {
		  const { t } = props;
		  const [mode, setMode] = (0, import_react.useState)("new");
		  const [branch, setBranch] = (0, import_react.useState)("");
		  const [base, setBase] = (0, import_react.useState)(props.initial.branch ?? "HEAD");
		  const [existing, setExisting] = (0, import_react.useState)("");
		  const [info, setInfo] = (0, import_react.useState)(props.initial);
		  const [busy, setBusy] = (0, import_react.useState)(false);
		  const [error, setError] = (0, import_react.useState)("");
		  (0, import_react.useEffect)(() => {
		    let alive = true;
		    probeRepo(props.cwd).then((next) => {
		      if (!alive || next.isRepo !== true)
		        return;
		      setInfo(next);
		      if (next.branch !== void 0)
		        setBase((current) => current === "HEAD" ? next.branch : current);
		    }).catch(() => {
		    });
		    return () => {
		      alive = false;
		    };
		  }, [props.cwd]);
		  const branches = info.branches ?? [];
		  const draft = mode === "new" ? branch : existing;
		  const issue = draft.trim() === "" ? null : branchIssue(draft, branches, base, mode);
		  const valid = draft.trim() !== "" && issue === null;
		  const separator = info.mainRoot?.includes("\\") === true ? "\\" : "/";
		  const target = info.mainRoot === void 0 || draft.trim() === "" ? "" : `${info.mainRoot}${separator}.agents${separator}worktree${separator}${flatten(draft.trim())}`;
		  const submit = async () => {
		    if (!valid || busy)
		      return;
		    setBusy(true);
		    setError("");
		    try {
		      await props.createWorktree({
		        path: props.cwd,
		        mode,
		        branch: draft.trim(),
		        ...mode === "new" ? { base } : {}
		      });
		      props.onClose();
		    } catch (failure) {
		      setError(errorText(failure));
		      setBusy(false);
		    }
		  };
		  const close = () => {
		    if (!busy)
		      props.onClose();
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    import_dsh_client_ui_primitives.Modal,
		    {
		      open: true,
		      className: "wt-dialog",
		      title: t("createTitle"),
		      closeLabel: t("close"),
		      onClose: close,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		        info.isLinkedWorktree === true && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          import_dsh_client_ui_primitives.Button,
		          {
		            variant: "ghost",
		            onClick: props.onDeleteCurrent,
		            disabled: busy,
		            style: { color: "var(--dsw-alias-text-error, #e5484d)", marginRight: "auto" },
		            children: t("deleteCurrent")
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", onClick: close, disabled: busy, children: t("cancel") }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", onClick: () => {
		          void submit();
		        }, disabled: !valid || busy, children: busy ? t("creating") : t("create") })
		      ] }),
		      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "wt-dialog-body", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          import_dsh_client_ui_primitives.Checkbox,
		          {
		            checked: mode === "new",
		            onChange: () => setMode("new"),
		            label: t("modeNew"),
		            disabled: busy
		          }
		        ),
		        mode === "new" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: fieldStyle, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("branchName") }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		              import_dsh_client_ui_primitives.Input,
		              {
		                value: branch,
		                placeholder: t("branchNamePlaceholder"),
		                spellCheck: false,
		                autoComplete: "off",
		                disabled: busy,
		                "data-modal-autofocus": "",
		                onChange: (event) => setBranch(event.target.value),
		                onKeyDown: (event) => {
		                  if (event.key === "Enter")
		                    void submit();
		                }
		              }
		            )
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: fieldStyle, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("baseBranch") }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		              BranchPicker,
		              {
		                value: base,
		                placeholder: t("chooseBranch"),
		                branches,
		                disableOccupied: false,
		                t,
		                onSelect: setBase
		              }
		            )
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          import_dsh_client_ui_primitives.Checkbox,
		          {
		            checked: mode === "existing",
		            onChange: () => setMode("existing"),
		            label: t("modeExisting"),
		            disabled: busy
		          }
		        ),
		        mode === "existing" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: fieldStyle, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          BranchPicker,
		          {
		            value: existing,
		            placeholder: t("chooseBranch"),
		            branches,
		            disableOccupied: true,
		            autoFocus: true,
		            t,
		            onSelect: setExisting
		          }
		        ) }),
		        target !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: mutedStyle, children: [
		          t("target"),
		          ":",
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wt-dialog-path", style: { marginTop: 2 }, children: target })
		        ] }),
		        issue !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: dangerStyle, children: t(issue) }),
		        error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: dangerStyle, children: error })
		      ] })
		    }
		  );
		}
		function WorktreeButton({ sessionId, useSessions, useWorkspaces, t, createWorktree }) {
		  const summary = useSessions((state) => state.byId[sessionId]);
		  const cwd = summary?.cwd;
		  const workspaceId = useWorkspaces((state) => state.items.find((item) => item.sessionIds.includes(sessionId))?.workspaceId);
		  const [repo, setRepo] = (0, import_react.useState)(null);
		  const [sessionBranchState, setSessionBranchState] = (0, import_react.useState)(null);
		  const [open, setOpen] = (0, import_react.useState)(false);
		  const [error, setError] = (0, import_react.useState)(null);
		  const busy = (0, import_react.useRef)(false);
		  const sessionBranch = sessionBranchState !== null && sessionBranchState.cwd === cwd ? sessionBranchState.branch : "";
		  (0, import_react.useEffect)(() => {
		    setOpen(false);
		    setRepo(null);
		    if (cwd === void 0 || cwd === "")
		      return;
		    let active = true;
		    let pending = false;
		    const refreshBranch = async () => {
		      if (pending)
		        return;
		      pending = true;
		      try {
		        const result = await getSessionBranch(cwd);
		        if (active) {
		          const next = result.isRepo ? result.branch : "";
		          setSessionBranchState((current) => current?.cwd === cwd && current.branch === next ? current : { cwd, branch: next });
		        }
		      } catch {
		        if (active)
		          setSessionBranchState((current) => current?.cwd === cwd && current.branch === "" ? current : { cwd, branch: "" });
		      } finally {
		        pending = false;
		      }
		    };
		    void refreshBranch();
		    const timer = window.setInterval(() => {
		      void refreshBranch();
		    }, 5e3);
		    return () => {
		      active = false;
		      window.clearInterval(timer);
		    };
		  }, [cwd]);
		  const openDialog = async () => {
		    if (cwd === void 0 || busy.current)
		      return;
		    busy.current = true;
		    try {
		      const info = await probeRepo(cwd);
		      if (info.gitMissing === true) {
		        setError({ seq: Date.now(), text: t("gitMissing") });
		        return;
		      }
		      if (info.isRepo !== true) {
		        setError({ seq: Date.now(), text: t("notRepo") });
		        return;
		      }
		      setRepo(info);
		      setOpen(true);
		    } catch (failure) {
		      setError({ seq: Date.now(), text: errorText(failure) });
		    } finally {
		      busy.current = false;
		    }
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      import_dsh_client_ui_primitives.Button,
		      {
		        variant: "ghost",
		        size: "sm",
		        title: t("buttonTitle"),
		        "aria-label": t("buttonTitle"),
		        icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconBranchVerticalRegular, { size: 16 }),
		        style: { width: 28, minWidth: 28, padding: 0, flex: "none" },
		        onClick: () => {
		          void openDialog();
		        }
		      }
		    ),
		    sessionBranch !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      "span",
		      {
		        title: sessionBranch,
		        style: {
		          alignSelf: "center",
		          marginLeft: 6,
		          maxWidth: 180,
		          overflow: "hidden",
		          textOverflow: "ellipsis",
		          whiteSpace: "nowrap",
		          opacity: 0.72,
		          fontSize: 12,
		          lineHeight: "18px"
		        },
		        children: sessionBranch
		      }
		    ),
		    open && repo !== null && cwd !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      CreateWorktreeDialog,
		      {
		        cwd,
		        initial: repo,
		        t,
		        createWorktree,
		        onClose: () => setOpen(false),
		        onDeleteCurrent: () => {
		          setOpen(false);
		          openDeleteRequest(sessionId, summary?.displayTitle ?? "", workspaceId);
		        }
		      }
		    ),
		    error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Toast, { text: error.text, holdMs: 4e3, onDone: () => setError(null) }, error.seq)
		  ] });
		}
		var deleteRequest = null;
		var deleteSeq = 0;
		var deleteListeners = /* @__PURE__ */ new Set();
		function notifyDelete() {
		  for (const listener of deleteListeners)
		    listener();
		}
		function subscribeDelete(listener) {
		  deleteListeners.add(listener);
		  return () => {
		    deleteListeners.delete(listener);
		  };
		}
		function getDeleteRequest() {
		  return deleteRequest;
		}
		function openDeleteRequest(sessionId, displayTitle, workspaceId) {
		  deleteSeq += 1;
		  deleteRequest = { sessionId, displayTitle, workspaceId, seq: deleteSeq };
		  notifyDelete();
		}
		function closeDeleteRequest() {
		  deleteRequest = null;
		  notifyDelete();
		}
		function DeleteWorktreeMenuItem({ sessionId, displayTitle, useMenuOpenState, useWorkspaces, t, requestDelete }) {
		  const workspaceId = useWorkspaces((state) => state.items.find((item) => item.sessionIds.includes(sessionId))?.workspaceId);
		  const [, setMenuOpen] = useMenuOpenState();
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    import_dsh_client_ui_primitives.MenuItemButton,
		    {
		      danger: true,
		      separatorBefore: true,
		      icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTrashOutlineRegular, { size: 14 }),
		      onSelect: () => {
		        setMenuOpen(false);
		        requestDelete(sessionId, displayTitle, workspaceId);
		      },
		      children: t("deleteMenu")
		    }
		  );
		}
		function DeleteWorktreeOverlay({ useSessions, useWorkspaces, t, deleteWorktree }) {
		  const pending = (0, import_react.useSyncExternalStore)(subscribeDelete, getDeleteRequest);
		  const session = useSessions((state) => pending === null ? void 0 : state.byId[pending.sessionId]);
		  const workspace = useWorkspaces((state) => pending === null ? void 0 : state.items.find((item) => item.sessionIds.includes(pending.sessionId)));
		  const [toast, setToast] = (0, import_react.useState)(null);
		  const skip = (text) => {
		    closeDeleteRequest();
		    setToast({ seq: Date.now(), text });
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		    pending !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		      DeleteWorktreeGate,
		      {
		        pending,
		        cwd: session?.cwd,
		        workspaceId: pending.workspaceId ?? workspace?.workspaceId,
		        sessionIds: workspace?.sessionIds ?? [],
		        t,
		        deleteWorktree,
		        onClose: closeDeleteRequest,
		        onSkip: skip,
		        onDone: (text) => {
		          closeDeleteRequest();
		          setToast({ seq: Date.now(), text, tone: "success" });
		        }
		      },
		      pending.seq
		    ),
		    toast !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Toast, { text: toast.text, tone: toast.tone, holdMs: 4e3, onDone: () => setToast(null) }, toast.seq)
		  ] });
		}
		function DeleteWorktreeGate(props) {
		  const [ready, setReady] = (0, import_react.useState)(false);
		  const cwd = (0, import_react.useRef)(props.cwd).current;
		  const workspaceId = (0, import_react.useRef)(props.workspaceId).current;
		  (0, import_react.useEffect)(() => {
		    let alive = true;
		    if (cwd === void 0) {
		      props.onSkip(props.t("notWorktree"));
		      return () => {
		        alive = false;
		      };
		    }
		    probeRepo(cwd).then((info) => {
		      if (!alive)
		        return;
		      if (info.gitMissing === true) {
		        props.onSkip(props.t("gitMissing"));
		        return;
		      }
		      if (info.isRepo !== true || info.isLinkedWorktree !== true) {
		        props.onSkip(props.t("notWorktree"));
		        return;
		      }
		      setReady(true);
		    }).catch((failure) => {
		      if (alive)
		        props.onSkip(errorText(failure));
		    });
		    return () => {
		      alive = false;
		    };
		  }, [cwd]);
		  if (!ready)
		    return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    DeleteWorktreeDialog,
		    {
		      pending: props.pending,
		      cwd,
		      workspaceId,
		      sessionIds: props.sessionIds,
		      t: props.t,
		      deleteWorktree: props.deleteWorktree,
		      onClose: props.onClose,
		      onDone: props.onDone
		    }
		  );
		}
		function DeleteWorktreeDialog(props) {
		  const { t } = props;
		  const [facts, setFacts] = (0, import_react.useState)(null);
		  const [busy, setBusy] = (0, import_react.useState)(false);
		  const [error, setError] = (0, import_react.useState)("");
		  (0, import_react.useEffect)(() => {
		    let alive = true;
		    if (props.cwd === void 0)
		      return () => {
		        alive = false;
		      };
		    inspectOnDisk(props.cwd).then((next) => {
		      if (alive) setFacts(next);
		    }).catch((failure) => {
		      if (alive) setError(errorText(failure));
		    });
		    return () => {
		      alive = false;
		    };
		  }, [props.cwd]);
		  const confirm = async () => {
		    if (facts === null || props.workspaceId === void 0 || busy)
		      return;
		    setBusy(true);
		    setError("");
		    try {
		      await props.deleteWorktree({
		        sessionId: props.pending.sessionId,
		        workspaceId: props.workspaceId,
		        path: facts.path
		      });
		      props.onDone(t("deleted", { path: facts.path }));
		    } catch (failure) {
		      const message = messageOf(failure);
		      setError(message === "running" || message.includes("session-active") ? t("running") : message === "workspace-missing" ? t("workspaceMissing") : errorText(failure));
		      setBusy(false);
		    }
		  };
		  const close = () => {
		    if (!busy)
		      props.onClose();
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    import_dsh_client_ui_primitives.Modal,
		    {
		      open: true,
		      className: "wt-dialog",
		      title: t("deleteTitle"),
		      closeLabel: t("close"),
		      onClose: close,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "ghost", onClick: close, disabled: busy, children: t("cancel") }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		          import_dsh_client_ui_primitives.Button,
		          {
		            variant: "primary",
		            onClick: () => {
		              void confirm();
		            },
		            disabled: facts === null || props.workspaceId === void 0 || busy,
		            children: busy ? t("deleting") : t("confirmDelete")
		          }
		        )
		      ] }),
		      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "wt-dialog-body", style: { fontSize: 13, lineHeight: "20px" }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6, fontWeight: 500, minWidth: 0 }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconBranchVerticalRegular, { size: 14 }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: facts === null ? t("reading") : facts.branch !== "" ? facts.branch : t("detachedHead") })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { ...dangerStyle, fontSize: 13 }, children: t("deleteWarning") }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", { className: "wt-dialog-list", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("willArchive", { count: props.sessionIds.length }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("willRemoveWorkspace") }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
		            t("willRemoveDir"),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wt-dialog-path", style: { marginTop: 2 }, children: facts?.path ?? props.cwd ?? "" })
		          ] }),
		          facts !== null && facts.dirty > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { style: dangerStyle, children: t("dirty", { count: facts.dirty }) }),
		          facts !== null && facts.ahead !== null && facts.ahead > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("ahead", { count: facts.ahead }) }),
		          facts !== null && facts.branch !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: t("branchKept", { branch: facts.branch }) })
		        ] }),
		        error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: dangerStyle, children: error })
		      ] })
		    }
		  );
		}
		function fail(prefix, failure, path) {
		  return new Error(`${prefix}${errorText(failure)}\uFF08\u8DEF\u5F84\uFF1A${path}\uFF09`);
		}
		function apply(ctx) {
		  ensureStyle();
		  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "simple-worktree: dictionaries");
		  const createWorktree = async (input) => {
		    const created = await createOnDisk(input);
		    let workspace;
		    try {
		      workspace = await ctx.workspaces.create({ path: created.path });
		    } catch (failure) {
		      throw fail("worktree \u5DF2\u521B\u5EFA\uFF0C\u4F46\u6CE8\u518C\u5DE5\u4F5C\u533A\u5931\u8D25\uFF1A", failure, created.path);
		    }
		    try {
		      ctx.uiWorkspace.startSession(workspace.workspaceId);
		    } catch (failure) {
		      throw fail("\u5DE5\u4F5C\u533A\u5DF2\u6CE8\u518C\uFF0C\u4F46\u65B0\u5EFA\u4F1A\u8BDD\u5931\u8D25\uFF1A", failure, created.path);
		    }
		    return created;
		  };
		  const deleteWorktree = createDeleteWorktree(ctx, removeOnDisk);
		  ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
		    name: "conversation.input.left",
		    id: "simple-worktree.create",
		    order: 6,
		    locale: NS,
		    inject: () => ({ createWorktree })
		  }, WorktreeButton));
		  ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
		    name: "sidebar.workspaces.session.menu.item",
		    id: "simple-worktree.delete",
		    order: 500,
		    locale: NS,
		    inject: () => ({ requestDelete: openDeleteRequest })
		  }, DeleteWorktreeMenuItem));
		  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
		    name: "shell.overlay",
		    id: "simple-worktree.delete-dialog",
		    order: 0,
		    locale: NS,
		    inject: () => ({ deleteWorktree })
		  }, DeleteWorktreeOverlay));
		}

		return module.exports;
	}
});
