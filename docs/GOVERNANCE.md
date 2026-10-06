# Governance Gate

This repository treats exact-head CI and runtime evidence as proof only when the authoritative branch cannot silently bypass those checks.

## Required main-branch invariant

`main` must be protected by GitHub branch protection or an equivalent repository ruleset.

At minimum, the protection should prevent ordinary direct pushes from bypassing the review/check path and require the repository's CI before merge.

The `Governance` workflow intentionally fails while GitHub reports `main.protected=false`. A red Governance check in that state is a truthful blocker receipt, not a flaky test.

## Authority boundary

Repository files and CI cannot enable GitHub branch protection themselves. That setting requires GitHub repository administration authority. Until protection is enabled, code correctness can be VERIFIED while branch-governance state remains BLOCKED.
