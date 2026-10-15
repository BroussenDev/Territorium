export const REPO = { owner: "BroussenDev", repo: "Territorium" } as const;

export const TRUSTED_REPO_PERMISSIONS = ["admin", "maintain", "write"] as const;

// Bot authors whose PRs are exempt from the gate (e.g. Dependabot dependency bumps).
export const TRUSTED_BOT_AUTHORS = ["dependabot[bot]"] as const;

export const SMALL_FIX_LINE_THRESHOLD = 50;

export const APPROVED_ISSUE_LABEL = "approved";

export const LABELS = {
  BYPASS: "bypass-pr-check",
  SMALL_FIX: "small-fix",
  AUTO_CLOSED: "auto-closed-needs-issue",
} as const;

export const LABEL_COLORS: Record<string, string> = {
  [LABELS.SMALL_FIX]: "0E8A16",
  [LABELS.AUTO_CLOSED]: "B60205",
};

export const LABEL_DESCRIPTIONS: Record<string, string> = {
  [LABELS.SMALL_FIX]: `Small fix (≤ ${SMALL_FIX_LINE_THRESHOLD} lines) — auto-applied by PR gate`,
  [LABELS.AUTO_CLOSED]: "PR closed by gate — see comment for next steps",
};

export const CLOSE_COMMENT = (author: string): string =>
  `Hi @${author}, thanks for the contribution.

This pull request was closed automatically because it doesn't follow Territorium's contribution workflow:

- You aren't assigned to an issue labelled \`${APPROVED_ISSUE_LABEL}\`, **and**
- The change is larger than ${SMALL_FIX_LINE_THRESHOLD} lines (the limit for unrequested contributions).

**To contribute to Territorium:**

1. **Bugs and small improvements:** open an [issue](https://github.com/${REPO.owner}/${REPO.repo}/issues/new/choose). The maintainer labels it \`${APPROVED_ISSUE_LABEL}\` if it will be worked on.
2. **Feature ideas:** open an issue to discuss it first. Unrequested feature pull requests aren't accepted, even good ones: every merged feature has to be maintained for good.
3. **Once the issue is labelled \`${APPROVED_ISSUE_LABEL}\`,** ask in a comment to be assigned, then open a pull request that references it (\`Closes #123\`).

Fixes of ${SMALL_FIX_LINE_THRESHOLD} lines or less are always welcome without an issue.

If you think this was closed by mistake, say so in a comment below.

See [CONTRIBUTING.md](https://github.com/${REPO.owner}/${REPO.repo}/blob/main/CONTRIBUTING.md) for the whole process.

— *Automated pull request check. [Source](https://github.com/${REPO.owner}/${REPO.repo}/tree/main/scripts/pr-gate).*`;
