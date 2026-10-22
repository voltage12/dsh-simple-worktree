# Changelog

## 0.1.2

Security and data-preservation release of the deletion fix in commit
`147e64db51575c85d407f44681ad1ed8777a873f`.

- Complete Git worktree deletion and confirm the result before archiving sessions
  or unregistering the workspace.
- Preserve remaining user data when Git refuses deletion, directory cleanup fails,
  or an unexpected error occurs. Do not automatically unlock, prune, or recursively
  force-delete a directory as a fallback.
- Keep failed operations retryable. After confirmed disk deletion, retries in the
  current window resume workspace cleanup without deleting the directory again.
- Restore sessions archived by an incomplete cleanup and their previous pin state
  when possible; identify sessions requiring manual recovery if restoration fails.
- Stop cleanup when workspace membership, paths, or session activity changes.

The existing explicit force-delete confirmation still permits Git to remove an
unlocked worktree containing uncommitted changes. Git locks remain respected.
Creation-flow recovery is outside this release.
