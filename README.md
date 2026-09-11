# agent-webui-relay

**A one-way CLI relay for dispatching agent tasks into AI web interfaces with Playwright.**

`agent-webui-relay` intentionally automates **input**, not model output. It opens a dedicated persistent browser profile, navigates to a ChatGPT conversation, submits a task, confirms that the user message was posted, and returns submission metadata plus the conversation URL.

It does **not** scrape, stream, proxy, or return assistant responses.

> Input automation, not output extraction.

## Status

v0.1 currently ships a ChatGPT Web adapter. The provider layer is separated so other web UIs can be added later.

## Requirements

- Node.js 20+
- npm
- A ChatGPT account you can log into interactively

## Install

### macOS / Linux

```bash
./install.sh
```

### Windows PowerShell

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

The installer installs dependencies, downloads Playwright Chromium, builds TypeScript, and installs two commands:

```text
agent-webui-relay
awr
```

If the normal global npm location is not writable, the installers fall back to a user-scoped location. The PowerShell installer adds that location to the user's PATH; the shell installer prints the PATH line if your shell does not already include it.

## First login

```bash
awr login
```

A dedicated Chromium profile opens. Log into ChatGPT normally. No email address or password is stored by this project; the persistent browser profile itself holds the browser session and must be treated as a secret.

Profiles are separate from your normal Chrome profile.

Use another profile if needed:

```bash
awr login --profile work
```

## Save a conversation alias

```bash
awr chat add realmseed https://chatgpt.com/c/<conversation-id>
```

Then send work to it:

```bash
awr send realmseed "Check GitHub and execute the latest task from Claude."
```

Or use the full URL directly:

```bash
awr send https://chatgpt.com/c/<conversation-id> "Review the latest branch."
```

## Start a new conversation

```bash
awr send --new "Investigate issue #42 and leave the result on GitHub."
```

Save the resulting conversation locally at the same time:

```bash
awr send --new --alias issue42 "Investigate issue #42."
```

The command returns the newly observed ChatGPT conversation URL when available.

## Files and stdin

```bash
awr send realmseed --file task.md
```

```bash
cat task.md | awr send realmseed --stdin
```

## Idempotency

Callers can provide an idempotency key:

```bash
awr send realmseed \
  --idempotency-key claude-issue-42-review-v1 \
  "Review issue #42."
```

A successfully submitted key will not be submitted twice. If the browser fails after submission begins and delivery cannot be proven, the job is marked `uncertain` and blind retry is deliberately avoided.

```bash
awr status <submission-id>
```

## Machine-readable output

stdout is JSON so other agents and scripts can call the CLI directly:

```json
{
  "ok": true,
  "status": "submitted",
  "submission_id": "550e8400-e29b-41d4-a716-446655440000",
  "profile_id": "default",
  "target": {
    "conversation_alias": "realmseed",
    "conversation_id": "...",
    "conversation_url": "https://chatgpt.com/c/..."
  },
  "submitted_at": "2026-09-12T00:00:00.000Z",
  "confirmed_by": "user_message",
  "attempt": 1
}
```

No assistant response body is included.

## Health checks

Check whether the saved browser session still reaches the ChatGPT composer:

```bash
awr auth
```

Check browser/profile/UI readiness without sending anything:

```bash
awr doctor
```

For interactive diagnosis:

```bash
awr doctor --headed
```

## Local data

The data directory contains:

- dedicated Chromium profiles
- conversation aliases
- submission metadata
- idempotency keys
- short-lived lock files

The prompt body itself is **not stored** in relay state. Submissions store only its SHA-256 hash and character count.

Default data locations:

- Linux: `$XDG_DATA_HOME/agent-webui-relay` or `~/.local/share/agent-webui-relay`
- macOS: `~/Library/Application Support/agent-webui-relay`
- Windows: `%LOCALAPPDATA%\agent-webui-relay`

Override it with:

```text
AGENT_WEBUI_RELAY_HOME=/path/to/data
```

## Concurrency and delivery semantics

A persistent browser profile may only be owned by one relay process at a time. `agent-webui-relay` therefore takes a per-profile lock.

Delivery favors **at-most-once** behavior over accidental duplicate work:

```text
queued
  -> opening
  -> ready
  -> typing
  -> submit_started
  -> submitted
```

If failure happens before `submit_started`, the submission is `failed`.

If failure happens after `submit_started` and successful delivery cannot be confirmed, the submission becomes `uncertain` instead of being retried automatically.

## Security model

The dedicated browser profile is an authentication secret. Protect the relay data directory accordingly.

This project intentionally does not implement:

- assistant response scraping
- response streaming
- an OpenAI-compatible response API
- cookie/session export
- account pooling
- CAPTCHA bypass
- rate-limit bypass
- automatic challenge bypass

Debug screenshots and Playwright traces are also not captured by default because they can contain conversation content.

## Architecture

```text
Claude / Codex / scripts / cron
             |
             v
     agent-webui-relay
             |
      profile lock + state
             |
         Playwright
             |
             v
        ChatGPT Web
             |
      task executes there
             |
     GitHub / other tools
```

The relay's success condition is **task submission**, not model completion.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | submitted / already submitted / successful command |
| 2 | invalid CLI input / unknown submission |
| 10 | login required or login not confirmed |
| 11 | conversation alias not found |
| 12 | composer/input preparation failed |
| 13 | submit failed before confirmation |
| 14 | human interaction required |
| 15 | submission uncertain; do not blindly retry |
| 20 | profile/lock timeout |
| 30 | internal error |

## License

MIT
