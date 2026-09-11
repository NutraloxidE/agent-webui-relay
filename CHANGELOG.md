# Changelog

## 0.2.0 - 2026-09-12

- Add `awr init-skill` for installing a portable Agent Skills `SKILL.md` into the current project.
- Use the conventional `.agents/skills/agent-webui-relay/SKILL.md` project-local layout.
- Refuse to overwrite an existing skill unless `--force` is provided.
- Ship agent-facing guidance for health checks, aliases, one-way delivery, idempotency, and `uncertain` submissions.
- Include `README.ja.md` and Agent Skills metadata in the npm package.

## 0.1.0 - 2026-09-12

- Initial Node.js/TypeScript CLI.
- ChatGPT Web one-way task submission via Playwright.
- Persistent dedicated browser profiles with manual login.
- Conversation aliases and new-conversation URL capture.
- JSON submission metadata, idempotency keys, and at-most-once-oriented delivery state.
- macOS/Linux `install.sh` and Windows PowerShell `install.ps1`.
- `agent-webui-relay` and `awr` commands.
