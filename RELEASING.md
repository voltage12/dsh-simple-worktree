# Publishing the 0.1.2 safety and branch display release

This release contains the deletion fix already merged as
`147e64db51575c85d407f44681ad1ed8777a873f`, plus a session composer branch
indicator backed by a lightweight Host route. Creation-flow recovery is excluded.

## Verified on 2026-10-22

- The public npm registry lists `0.0.0-stage`, `0.1.0`, and `0.1.1`, with
  `latest` pointing to `0.1.1`. An explicit lookup for `0.1.2` returns `E404`.
- The downloaded `0.1.1` tarball has SHA-1
  `97ff143099fb6c06078865776a73dc27abc79eac` and contains the old unsafe deletion
  fallback and archive-before-disk-delete order.
- Node `24.19.0`, pnpm `11.25.0`: `pnpm test` (30/30), `pnpm build`,
  `pnpm typecheck`, and `pnpm pack` pass.
- Installing the generated tarball in a clean temporary prefix succeeds.
  `scripts/verify-package.mjs` checks its manifest and exact bundle contents,
  then runs all 30 deletion and branch-query regressions against the installed
  Host and the Client deletion helper in the installed browser bundle. All pass. The script
  exposes the private Client helper only in memory; shipped code is unchanged.
- `npm publish <tarball> --dry-run --access public --tag latest
  --registry=https://registry.npmjs.org` passes packaging validation.
- `npm whoami --registry=https://registry.npmjs.org` returns `ENEEDAUTH`.
  No actual npm publication or post-publication registry installation was performed.

Regression tests are run from the checkout; they do not need to ship in the
runtime npm package. The tarball includes both `lib/index.js` and `lib/client.js`,
the Cordis patch, README, changelog, license, and screenshots.

## Rebuild and verify

Run from this release checkout, using a Node version supported by `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm typecheck
pnpm pack
verify_prefix=$(mktemp -d)
npm install --prefix "$verify_prefix" ./voltage12-dsh-simple-worktree-0.1.2.tgz --ignore-scripts --package-lock=false --no-audit --no-fund
node scripts/verify-package.mjs "$verify_prefix/node_modules/@voltage12/dsh-simple-worktree"
npm publish ./voltage12-dsh-simple-worktree-0.1.2.tgz --dry-run --access public --tag latest --registry=https://registry.npmjs.org
```

## Publish with an authorized npm account

Authenticate through your normal npm login/token workflow, then check:

```sh
npm whoami --registry=https://registry.npmjs.org
npm view @voltage12/dsh-simple-worktree versions dist-tags --json --registry=https://registry.npmjs.org
```

Confirm `0.1.2` is still absent. If it has appeared, inspect that artifact instead
of attempting to overwrite the immutable version. Publish the exact verified
tarball (npm may require the account's second factor):

```sh
npm publish ./voltage12-dsh-simple-worktree-0.1.2.tgz --access public --tag latest --registry=https://registry.npmjs.org
```

## Verify the published artifact

```sh
npm view @voltage12/dsh-simple-worktree@0.1.2 version dist --json --registry=https://registry.npmjs.org
npm view @voltage12/dsh-simple-worktree dist-tags --json --registry=https://registry.npmjs.org
published_prefix=$(mktemp -d)
npm install --prefix "$published_prefix" @voltage12/dsh-simple-worktree@0.1.2 --ignore-scripts --package-lock=false --no-audit --no-fund --registry=https://registry.npmjs.org
node scripts/verify-package.mjs "$published_prefix/node_modules/@voltage12/dsh-simple-worktree"
```

Compare the registry `dist.integrity` with the SHA-512 SRI of the exact local
tarball you published:

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; console.log("sha512-" + createHash("sha512").update(readFileSync("voltage12-dsh-simple-worktree-0.1.2.tgz")).digest("base64"))'
```

These checks validate package installation and deletion logic. A full DSH web
The branch label's live composer rendering still requires a running compatible
DSH instance for a UI smoke test.
