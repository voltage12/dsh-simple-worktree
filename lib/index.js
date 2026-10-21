// src/host/index.js
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
var name = "simple-worktree";
var inject = [];
var ROUTE_PREFIX = "/plugin/simple-worktree";
var BODY_LIMIT = 64 * 1024;
var MAX_SLOT_ATTEMPTS = 200;
function runGit(cwd, args) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn("git", args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolvePromise({
        ok: false,
        code: -1,
        missing: error?.code === "ENOENT",
        stdout: "",
        stderr: String(error?.message ?? error)
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolvePromise({
        ok: false,
        code: -1,
        missing: error?.code === "ENOENT",
        stdout,
        stderr: String(error?.message ?? error)
      });
    });
    child.on("close", (code) => {
      resolvePromise({ ok: code === 0, code: code ?? -1, stdout, stderr });
    });
  });
}
function samePath(left, right) {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function firstLine(text) {
  return String(text ?? "").split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0) ?? "";
}
function gitMessage(result, fallback) {
  const line = firstLine(result.stderr);
  return line.length > 0 ? line.replace(/^(fatal|error):\s*/i, "") : fallback;
}
function friendlyGitMessage(result, fallback) {
  const raw = String(result?.stderr ?? "");
  if (/already checked out at/i.test(raw))
    return "\u8BE5\u5206\u652F\u5DF2\u88AB\u5176\u4ED6 worktree \u68C0\u51FA";
  if (/is a missing but already registered worktree/i.test(raw))
    return "\u8BE5\u76EE\u5F55\u5DF2\u88AB git \u767B\u8BB0\u4E3A worktree\uFF0C\u8BF7\u5148\u6267\u884C git worktree prune";
  if (/contains modified or untracked files/i.test(raw))
    return "worktree \u5185\u6709\u672A\u63D0\u4EA4\u7684\u6539\u52A8\uFF0C\u65E0\u6CD5\u5220\u9664";
  if (/is locked/i.test(raw))
    return "worktree \u5DF2\u88AB\u9501\u5B9A\uFF0C\u65E0\u6CD5\u5220\u9664";
  if (/invalid reference/i.test(raw))
    return "\u5206\u652F\u6216\u63D0\u4EA4\u4E0D\u5B58\u5728";
  if (/not a git repository/i.test(raw))
    return "\u5F53\u524D\u76EE\u5F55\u4E0D\u662F Git \u4ED3\u5E93";
  if (/permission denied/i.test(raw))
    return "\u6CA1\u6709\u6743\u9650\u8BBF\u95EE\u8BE5\u76EE\u5F55";
  const line = firstLine(raw);
  return line.length > 0 ? `${fallback}\uFF1A${line}` : fallback;
}
async function requireDirectory(value) {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error("\u7F3A\u5C11\u76EE\u5F55\u53C2\u6570");
  if (!isAbsolute(value))
    throw new Error(`\u76EE\u5F55\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${value}`);
  let info;
  try {
    info = await stat(value);
  } catch {
    throw new Error(`\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${value}`);
  }
  if (!info.isDirectory())
    throw new Error(`\u4E0D\u662F\u76EE\u5F55\uFF1A${value}`);
  return resolve(value);
}
async function checkedOutBranches(top) {
  const result = await runGit(top, ["worktree", "list", "--porcelain"]);
  const map = /* @__PURE__ */ new Map();
  if (!result.ok)
    return map;
  let current = "";
  for (const raw of result.stdout.split(/\r?\n/)) {
    if (raw.startsWith("worktree ")) {
      current = raw.slice("worktree ".length);
    } else if (raw.startsWith("branch refs/heads/")) {
      map.set(raw.slice("branch refs/heads/".length), current);
    }
  }
  return map;
}
async function localBranches(top) {
  const result = await runGit(top, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
  if (!result.ok)
    return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
async function probe(directory) {
  const dir = await requireDirectory(directory);
  const inside = await runGit(dir, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok) {
    if (inside.missing === true)
      return { isRepo: false, gitMissing: true, error: "\u672A\u627E\u5230 git \u547D\u4EE4\uFF0C\u8BF7\u5148\u5B89\u88C5 Git \u5E76\u52A0\u5165 PATH" };
    return {
      isRepo: false,
      error: /not a git repository/i.test(String(inside.stderr)) ? "\u5F53\u524D\u76EE\u5F55\u4E0D\u662F Git \u4ED3\u5E93" : gitMessage(inside, "\u65E0\u6CD5\u8BFB\u53D6 Git \u4ED3\u5E93\u4FE1\u606F")
    };
  }
  const topResult = await runGit(dir, ["rev-parse", "--show-toplevel"]);
  if (!topResult.ok)
    return { isRepo: false, error: gitMessage(topResult, "\u65E0\u6CD5\u89E3\u6790\u4ED3\u5E93\u6839\u76EE\u5F55") };
  const top = normalize(topResult.stdout.trim());
  const gitDirResult = await runGit(dir, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const commonDirResult = await runGit(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  let gitDir = gitDirResult.ok ? gitDirResult.stdout.trim() : "";
  let commonDir = commonDirResult.ok ? commonDirResult.stdout.trim() : "";
  if (gitDir === "" || commonDir === "") {
    const legacyGit = await runGit(dir, ["rev-parse", "--git-dir"]);
    const legacyCommon = await runGit(dir, ["rev-parse", "--git-common-dir"]);
    gitDir = legacyGit.ok ? legacyGit.stdout.trim() : gitDir;
    commonDir = legacyCommon.ok ? legacyCommon.stdout.trim() : commonDir;
  }
  if (gitDir !== "" && !isAbsolute(gitDir))
    gitDir = resolve(top, gitDir);
  if (commonDir !== "" && !isAbsolute(commonDir))
    commonDir = resolve(top, commonDir);
  const isLinkedWorktree = gitDir !== "" && commonDir !== "" && !samePath(gitDir, commonDir);
  const mainRoot = normalize(isLinkedWorktree ? dirname(commonDir) : top);
  const branchResult = await runGit(dir, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const branch = branchResult.ok ? branchResult.stdout.trim() : void 0;
  const head = await runGit(dir, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const outs = await checkedOutBranches(top);
  const names = await localBranches(top);
  const branches = names.map((branchName) => ({
    name: branchName,
    worktreePath: outs.get(branchName) ?? null
  }));
  return {
    isRepo: true,
    top,
    mainRoot,
    gitDir,
    commonDir,
    isLinkedWorktree,
    branch,
    hasCommits: head.ok,
    branches
  };
}
function flattenBranch(branch) {
  return branch.split("/").join("-");
}
function pickSlot(agentsDir, slug) {
  for (let index = 1; index <= MAX_SLOT_ATTEMPTS; index += 1) {
    const candidate = join(agentsDir, index === 1 ? slug : `${slug}-${index}`);
    if (!existsSync(candidate))
      return candidate;
  }
  throw new Error(`\u65E0\u6CD5\u4E3A ${slug} \u627E\u5230\u7A7A\u95F2\u76EE\u5F55\u540D`);
}
async function ensureGitignore(repoRoot) {
  const file = join(repoRoot, ".gitignore");
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT")
      throw error;
  }
  const covered = text.split(/\r?\n/).some((raw) => {
    const line = raw.trim();
    return line === ".agents/worktree" || line === ".agents/worktree/" || line === "/.agents/worktree" || line === "/.agents/worktree/" || line === ".agents" || line === ".agents/" || line === "/.agents" || line === "/.agents/";
  });
  if (covered)
    return false;
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  await writeFile(file, `${text}${separator}.agents/worktree/
`, "utf8");
  return true;
}
async function assertBranchName(repoRoot, branch) {
  const result = await runGit(repoRoot, ["check-ref-format", "--branch", branch]);
  if (!result.ok)
    throw new Error(`\u5206\u652F\u540D\u4E0D\u5408\u6CD5\uFF1A${branch}`);
}
async function createWorktree(body) {
  const target = await probe(body?.path);
  if (target.gitMissing === true)
    throw new Error("\u672A\u627E\u5230 git \u547D\u4EE4\uFF0C\u8BF7\u5148\u5B89\u88C5 Git \u5E76\u52A0\u5165 PATH");
  if (!target.isRepo)
    throw new Error(target.error ?? "\u5F53\u524D\u76EE\u5F55\u4E0D\u662F Git \u4ED3\u5E93");
  if (!target.hasCommits)
    throw new Error("\u4ED3\u5E93\u8FD8\u6CA1\u6709\u4EFB\u4F55\u63D0\u4EA4\uFF0C\u65E0\u6CD5\u521B\u5EFA worktree");
  const mode = body?.mode === "existing" ? "existing" : "new";
  const branch = String(body?.branch ?? "").trim();
  if (branch === "")
    throw new Error("\u8BF7\u8F93\u5165\u5206\u652F\u540D");
  await assertBranchName(target.mainRoot, branch);
  const existing = target.branches.find((item) => item.name === branch);
  if (mode === "new") {
    if (existing !== void 0)
      throw new Error(`\u672C\u5730\u5DF2\u5B58\u5728\u5206\u652F ${branch}`);
  } else {
    if (existing === void 0)
      throw new Error(`\u672C\u5730\u4E0D\u5B58\u5728\u5206\u652F ${branch}`);
    if (existing.worktreePath !== null && existing.worktreePath !== "")
      throw new Error(`\u5206\u652F ${branch} \u5DF2\u88AB worktree \u5360\u7528\uFF1A${existing.worktreePath}`);
  }
  let base = "HEAD";
  if (mode === "new") {
    const requested = String(body?.base ?? "").trim();
    base = requested === "" ? target.branch ?? "HEAD" : requested;
    if (base !== "HEAD" && !target.branches.some((item) => item.name === base))
      throw new Error(`\u8D77\u70B9\u5206\u652F\u4E0D\u5B58\u5728\uFF1A${base}`);
  }
  const agentsDir = join(target.mainRoot, ".agents", "worktree");
  await mkdir(agentsDir, { recursive: true });
  await ensureGitignore(target.mainRoot);
  const directory = pickSlot(agentsDir, flattenBranch(branch));
  await runGit(target.mainRoot, ["worktree", "prune"]);
  const args = mode === "new" ? ["worktree", "add", "-b", branch, directory, base] : ["worktree", "add", directory, branch];
  const result = await runGit(target.mainRoot, args);
  if (!result.ok) {
    if (mode === "new") {
      await runGit(target.mainRoot, ["branch", "-D", branch]);
    }
    await runGit(target.mainRoot, ["worktree", "prune"]);
    throw new Error(friendlyGitMessage(result, "\u521B\u5EFA worktree \u5931\u8D25"));
  }
  return {
    path: directory,
    branch,
    repoRoot: target.mainRoot,
    created: true
  };
}
async function inspectWorktree(body) {
  const target = await probe(body?.path);
  if (target.gitMissing === true)
    throw new Error("\u672A\u627E\u5230 git \u547D\u4EE4\uFF0C\u8BF7\u5148\u5B89\u88C5 Git \u5E76\u52A0\u5165 PATH");
  if (!target.isRepo)
    throw new Error(target.error ?? "\u5F53\u524D\u76EE\u5F55\u4E0D\u662F Git \u4ED3\u5E93");
  if (!target.isLinkedWorktree)
    throw new Error("\u5F53\u524D\u4F1A\u8BDD\u4E0D\u5728 worktree \u4E2D");
  const status = await runGit(target.top, ["status", "--porcelain"]);
  const dirty = status.ok ? status.stdout.split(/\r?\n/).filter((line) => line.trim() !== "").length : 0;
  const upstream = await runGit(target.top, ["rev-list", "--count", "@{upstream}..HEAD"]);
  const ahead = upstream.ok ? Number.parseInt(upstream.stdout.trim(), 10) || 0 : null;
  return {
    path: target.top,
    branch: target.branch ?? "",
    dirty,
    ahead,
    repoRoot: target.mainRoot
  };
}
async function removeWorktree(body) {
  const target = await probe(body?.path);
  if (target.gitMissing === true)
    throw new Error("\u672A\u627E\u5230 git \u547D\u4EE4\uFF0C\u8BF7\u5148\u5B89\u88C5 Git \u5E76\u52A0\u5165 PATH");
  if (!target.isRepo)
    throw new Error(target.error ?? "\u5F53\u524D\u76EE\u5F55\u4E0D\u662F Git \u4ED3\u5E93");
  if (!target.isLinkedWorktree)
    throw new Error("\u5F53\u524D\u4F1A\u8BDD\u4E0D\u5728 worktree \u4E2D");
  if (samePath(target.top, target.mainRoot))
    throw new Error("\u4E0D\u80FD\u5220\u9664\u4E3B\u4ED3\u5E93\u7684\u5DE5\u4F5C\u76EE\u5F55");
  const force = body?.force === true;
  const result = await runGit(target.mainRoot, [
    "worktree",
    "remove",
    ...force ? ["--force"] : [],
    target.top
  ]);
  if (!result.ok) {
    await runGit(target.mainRoot, ["worktree", "unlock", target.top]);
    await runGit(target.mainRoot, ["worktree", "prune"]);
    if (existsSync(target.top))
      await rm(target.top, { recursive: true, force: true });
    await runGit(target.mainRoot, ["worktree", "prune"]);
    if (existsSync(target.top))
      throw new Error(friendlyGitMessage(result, "\u5220\u9664 worktree \u5931\u8D25"));
  }
  if (existsSync(target.top))
    await rm(target.top, { recursive: true, force: true });
  await runGit(target.mainRoot, ["worktree", "prune"]);
  return {
    removed: true,
    path: target.top,
    branch: target.branch ?? ""
  };
}
function readJson(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        req.destroy();
        rejectPromise(new Error("\u8BF7\u6C42\u4F53\u8FC7\u5927"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        rejectPromise(new Error(`\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${error?.message ?? error}`));
      }
    });
    req.on("error", rejectPromise);
  });
}
function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}
function apply(ctx) {
  ctx.inject(["webServer"], (webCtx) => {
    const get = (path, handler) => {
      webCtx.effect(() => webCtx.webServer.register({
        kind: "exact",
        path,
        handler: async (req, res) => {
          try {
            const query = new URL(req.url ?? "/", "http://x").searchParams;
            send(res, 200, await handler(query));
          } catch (error) {
            send(res, 400, { error: error instanceof Error ? error.message : String(error) });
          }
        }
      }), `simple-worktree: ${path} route`);
    };
    const post = (path, handler) => {
      webCtx.effect(() => webCtx.webServer.register({
        kind: "exact",
        path,
        handler: async (req, res) => {
          try {
            send(res, 200, await handler(await readJson(req)));
          } catch (error) {
            send(res, 400, { error: error instanceof Error ? error.message : String(error) });
          }
        }
      }), `simple-worktree: ${path} route`);
    };
    get(`${ROUTE_PREFIX}/probe`, (query) => probe(query.get("path") ?? ""));
    post(`${ROUTE_PREFIX}/create`, (body) => createWorktree(body));
    post(`${ROUTE_PREFIX}/inspect`, (body) => inspectWorktree(body));
    post(`${ROUTE_PREFIX}/remove`, (body) => removeWorktree(body));
  });
}
export {
  ROUTE_PREFIX,
  apply,
  createWorktree,
  inject,
  inspectWorktree,
  name,
  probe,
  removeWorktree
};
