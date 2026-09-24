# AGENTS.md — Guide for AI Coding Agents

The **authoritative guide** for how work is done in this repository, by agents or
humans. If another doc disagrees with this one, this one wins.

Work may be done by memoryless, cold-start sessions. Read order for a cold start:
**this file → your issue's acceptance criteria.**

---

## 1. Working loop (every issue)

1. **Take one issue.** Scope your work to that issue only.
2. **Test first.** Write a failing test (red), the minimal code to pass (green),
   then refactor.
3. **Gate before commit.** The repo's lint and test commands (§6) must be green.
   CI runs the same checks and must pass before merge.
4. **Commit atomically** (§2).
5. **Open one PR per issue** (§3). When a session's work is ready, open the PR —
   nobody is watching to ask for one. (Exception: you're explicitly told not to.)

Docs-only change (every changed file is `.md`)? Skip steps 2–3; see §4.

## 2. Commits

- **Atomic:** one logical change per commit; each commit passes lint and tests.
  Tests and the code they cover go in the same commit.
- **Conventional Commits:** `type(scope): imperative subject`
  - Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `build`, `style`.
  - Subject: imperative, lower-case, no trailing period, ≤ ~72 chars.
  - Body (optional): explain *why*, not *what*. Wrap near 72 chars.
  - Footer (optional): `Closes #N`, `BREAKING CHANGE: ...`.
- **Linear history:** no merge commits. Rebase your branch onto `main`; PRs land
  via **"Rebase and merge."** Clean up WIP commits before review.

## 3. Branches, issues & PRs

- **Branch** from `main` as `type/short-description` (e.g. `feat/login-form`).
- **One issue = one branch = one PR.** Link it with `Closes #N`. Trivial fixes
  (typos, broken links) may skip the issue.
- **Fill in the PR template**, including the plain-English `## TL;DR`.
- **Scope discipline:** implement the acceptance criteria, nothing more. No
  drive-by refactors or "while I'm here" fixes. Work that surfaces mid-issue but
  isn't in scope becomes its own issue ("Surfaced while working #N"), not a
  `TODO` or an expanded PR.
- **Issues** use the templates in `.github/ISSUE_TEMPLATE/`. Acceptance criteria
  must be testable statements, and every issue ends with a `## TL;DR`.
- Issues close only via a merged PR carrying `Closes #N`. An issue that turns out
  invalid is closed with a comment saying why.

## 4. Docs-only changes

A change is **docs-only** if every changed file ends in `.md`. For those:

- Commit type is `docs`. Skip TDD and the local lint/test gate.
- CI detects a Markdown-only diff and skips its checks automatically.
- Use the docs checklist in the PR template.

If CI doesn't skip, a non-Markdown file is in the diff — treat it as a code change.

## 5. CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR. Once a
`package.json` exists it runs `npm ci`, then `npm run lint` and `npm test`
(each only if that script is defined); until then it passes with nothing to
check. A red CI is never merged, and tests are never skipped or disabled to get
green.

## 6. Commands

Project-specific commands (install, lint, test, run) are listed here once the
project's toolchain is chosen. Keep CI (§5) running the same lint and test
commands contributors run locally.

## 7. When in doubt

Don't silently invent behavior. If an issue is ambiguous, ask in the issue/PR, or
file a follow-up issue and keep the current PR narrow.
