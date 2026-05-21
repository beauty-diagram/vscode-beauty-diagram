# Releasing

One-command release. `npm version` bumps `package.json`, runs tests + build, commits + tags, and pushes — CI takes over to publish to Marketplace + Open VSX + GitHub Release.

## Cut a release

```bash
npm version 0.1.1          # patch
npm version 0.2.0          # minor
npm version 0.1.0-alpha.1  # prerelease (Marketplace accepts but flagged)
```

What happens:

1. **`preversion`** — `npm run typecheck && npm test && npm run build`. Failure aborts before any file change.
2. **bump** — `package.json` version updated.
3. **`version`** — Stages `package.json` for commit.
4. **commit + tag** — Commit `release: 0.1.1`, tag `0.1.1`.
5. **`postversion`** — `git push --follow-tags origin main`.
6. **CI** — Tests + build + `vsce publish` + `ovsx publish` + GitHub Release with `.vsix` attached. ~30-60 s.

## Required GitHub Secrets

Set these in repo Settings → Secrets and variables → Actions:

- `VSCE_PAT` — Azure DevOps PAT with Marketplace publish scope. Create at https://dev.azure.com/.
- `OVSX_PAT` — Open VSX access token. Create at https://open-vsx.org/user-settings/tokens.

Without these secrets, the publish steps will skip but the GitHub Release will still be created — useful for the initial workflow shakedown.

## Aborting after push

```bash
git tag -d X.Y.Z
git push origin :refs/tags/X.Y.Z
git reset --hard HEAD~1
git push --force origin main
```

The Marketplace listing may show the failed publish; Microsoft staff can unlist on request.

## Conventions

- No `v` prefix on tags (`0.1.1`, not `v0.1.1`)
- Prerelease versions use `-alpha.N` / `-beta.N` / `-rc.N` suffix
- VS Code Marketplace prefers stable versions for the recommended listing; prereleases go in a separate "Pre-Release" tab
