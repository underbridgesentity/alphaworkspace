---
description: Run the security-guardian audit on the current changes (or a named target)
argument-hint: "[path | 'full' for a whole-codebase sweep]  (empty = current diff)"
---

Use the **security-guardian** subagent (`.claude/agents/security-guardian.md`)
to run a security review of Alpha Workspace.

Scope: $ARGUMENTS

If the scope is empty, review the current uncommitted working tree plus the
branch diff against `main`. If it is `full`, do a whole-codebase sweep of the
server, API routes, `src/proxy.ts`, `next.config.ts`, and the auth / billing /
meeting modules. Otherwise treat it as the path or PR to focus on.

Relay the guardian's report verbatim: findings most-severe first, each with
`file:line`, the invariant it breaks, the concrete failure scenario, and the
fix to apply; then the one-line verdict (SECURE / FIX BEFORE DEPLOY / NEEDS
REVIEW). This is a review only — do not apply changes.
