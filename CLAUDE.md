# CLAUDE.md

Claude Code specific notes. **Read [`AGENTS.md`](AGENTS.md) first** — it is the
canonical guide. This file adds only conventions specific to Claude Code.

## Asking questions

- Ask **one question at a time**, in plain chat, with a few suggested options
  the user can pick from or riff on.
- **Never** use the app's multiple-choice/question-picker widgets.

## CI watch protocol

- **Never watch.** Do not call `subscribe_pr_activity` on any PR you open.
  Cold-start sessions have no memory of prior runs, so a subscription left open
  has nobody to act on it — open the PR and end the turn.
