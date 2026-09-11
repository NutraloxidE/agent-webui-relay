<div align="center">

# agent-webui-relay

### Dispatch agent tasks into AI Web UIs — without turning the Web UI into an API.

**A one-way Playwright relay for agents, scripts, cron jobs, and weird automation graphs.**

**English** | [日本語](./README.ja.md)

[![CI](https://github.com/NutraloxidE/agent-webui-relay/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/NutraloxidE/agent-webui-relay/actions/workflows/ci.yml)
[![Stars](https://img.shields.io/github/stars/NutraloxidE/agent-webui-relay?style=for-the-badge&logo=github)](https://github.com/NutraloxidE/agent-webui-relay/stargazers)
[![Forks](https://img.shields.io/github/forks/NutraloxidE/agent-webui-relay?style=for-the-badge&logo=github)](https://github.com/NutraloxidE/agent-webui-relay/forks)
[![Issues](https://img.shields.io/github/issues/NutraloxidE/agent-webui-relay?style=for-the-badge&logo=github)](https://github.com/NutraloxidE/agent-webui-relay/issues)
[![License](https://img.shields.io/github/license/NutraloxidE/agent-webui-relay?style=for-the-badge)](./LICENSE)

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-browser%20automation-2EAD33?style=flat-square&logo=playwright&logoColor=white)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-SKILL.md-7C3AED?style=flat-square)
![Status](https://img.shields.io/badge/status-v0.2%20experimental-orange?style=flat-square)

<br />

> **Input automation, not output extraction.**

`agent-webui-relay` opens a dedicated browser profile, navigates to an AI conversation, posts a task, confirms that **your message** was submitted, and returns a machine-readable delivery receipt.

It deliberately does **not** scrape, stream, proxy, or return the assistant response.

[Quick Start](#-quick-start) · [Agent Skill](#-install-the-agent-skill) · [How It Works](#-how-it-works) · [CLI](#-cli) · [Security](#-security-model) · [Architecture](#-architecture)

</div>

---

## ⚡ Why this exists

You already have agents that can write code, review branches, open GitHub issues, run tests, and leave artifacts behind.

Sometimes the missing link is absurdly simple:

> **"How does Agent A put a task into the Web UI used by Agent B?"**

`agent-webui-relay` is that link.

```text
Claude / Codex / scripts / cron
             │
             │  task
             ▼
       agent-webui-relay
             │
             │  Playwright
             ▼
         ChatGPT Web
             │
             │  GitHub / tools / apps
             ▼
        work happens there
```

The relay exits after delivery. **The Web UI response is not transported back through the relay.**

---

## ✨ Features

- **One-way task dispatch** into AI Web UIs
- **Portable Agent Skills installer** via `awr init-skill`
- **Dedicated persistent Chromium profiles** — log in once, reuse the browser session
- **Conversation aliases** — `realmseed` beats pasting a UUID every time
- **Machine-readable JSON receipts** on stdout
- **Idempotency keys** to prevent accidental duplicate jobs
- **At-most-once delivery bias** — ambiguous sends become `uncertain`, not blindly retried
- **Prompt privacy by default** — relay state stores a SHA-256 + character count, not the prompt body
- **Profile locking** for concurrent callers
- **stdin / file / inline prompt input**
- **macOS / Linux installer** via `install.sh`
- **Windows installer** via `install.ps1`
- **Two commands:** `agent-webui-relay` and the much less annoying `awr`
- Provider layer separated so additional AI Web UIs can be added later

### Intentionally *not* included

`agent-webui-relay` does **not** implement assistant-response scraping, response streaming, an OpenAI-compatible response API, cookie export, account pooling, CAPTCHA bypass, rate-limit bypass, or automatic challenge bypass.

---

## 🚀 Quick Start

### 1. Clone

```bash
git clone https://github.com/NutraloxidE/agent-webui-relay.git
cd agent-webui-relay
```

### 2. Install

<table>
<tr>
<td><strong>macOS / Linux</strong></td>
<td><strong>Windows PowerShell</strong></td>
</tr>
<tr>
<td>

```bash
./install.sh
```

</td>
<td>

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

</td>
</tr>
</table>

The installer installs dependencies, downloads Playwright Chromium, builds the TypeScript project, and exposes:

```text
agent-webui-relay
awr
```

### 3. Log in once

```bash
awr login
```

A dedicated Chromium profile opens. Log into ChatGPT normally.

**No email address or password is stored by this project.** The persistent browser profile itself contains the browser session and should be treated as a secret.

### 4. Teach the current repo's agent how to use it

From the project where your agent works:

```bash
cd /path/to/your-project
awr init-skill
```

This creates:

```text
.agents/
└── skills/
    └── agent-webui-relay/
        └── SKILL.md
```

The generated skill follows the portable Agent Skills `SKILL.md` format: YAML frontmatter with `name` and `description`, followed by the operational instructions an agent needs to use `awr` safely.

### 5. Save a conversation

```bash
awr chat add realmseed https://chatgpt.com/c/<conversation-id>
```

### 6. Fire

```bash
awr send realmseed "Check GitHub and execute the latest task from Claude."
```

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
  "confirmed_by": "user_message",
  "attempt": 1
}
```

That's the contract.

**Task delivered. Receipt returned. No assistant response body extracted.**

---

## 🧩 Install the Agent Skill

`v0.2` can install its own usage instructions into any project that uses the portable Agent Skills directory convention.

Run this **inside the project the agent is working on**:

```bash
awr init-skill
```

Default output:

```text
./.agents/skills/agent-webui-relay/SKILL.md
```

Install into another project:

```bash
awr init-skill ../other-project
```

The command refuses to replace an existing skill:

```bash
awr init-skill
# -> SKILL_ALREADY_EXISTS
```

Overwrite only when you actually mean it:

```bash
awr init-skill --force
```

The generated skill teaches an agent to:

- check readiness with `awr doctor`
- inspect aliases with `awr chat list`
- submit inline, file, stdin, or new-conversation tasks
- use stable idempotency keys for retryable logical jobs
- treat `submitted` as **delivered**, not **completed**
- never blindly retry `uncertain`
- request `awr login` when human authentication is required
- prefer durable handoff outputs such as GitHub commits, issues, PR comments, or files

The skill is intentionally about **using the relay**, not embedding provider-specific secrets or login state into the project.

---

## 🧠 How it works

The important distinction is that `agent-webui-relay` has three different identities and refuses to blur them together:

| Concept | Meaning | Example |
|---|---|---|
| `profile_id` | Local browser/login profile | `default` |
| `conversation_id` | Conversation in the AI Web UI | ChatGPT `/c/<id>` |
| `submission_id` | One relay delivery attempt | UUID |
| `idempotency_key` | Caller-defined duplicate guard | `claude-issue-42-v1` |

There is intentionally **no generic `session_id`** doing five unrelated jobs.

### Delivery state machine

```text
queued
  │
  ▼
opening
  │
  ▼
ready
  │
  ▼
typing
  │
  ▼
submit_started
  ├──────────────► uncertain   # delivery may have happened; no blind retry
  │
  ▼
submitted
```

Before `submit_started`, a failure is just a failure.

After `submit_started`, ambiguity is dangerous. If successful delivery cannot be proven, the job becomes **`uncertain`** instead of automatically sending the same task twice.

---

## 🛠 CLI

### Initialize the portable Agent Skill

```bash
awr init-skill
```

```bash
awr init-skill ../other-project
```

```bash
awr init-skill --force
```

### Existing conversation

```bash
awr send realmseed "Review the latest branch."
```

Or use a ChatGPT conversation URL directly:

```bash
awr send https://chatgpt.com/c/<conversation-id> "Review the latest branch."
```

### New conversation

```bash
awr send --new "Investigate issue #42 and leave the result on GitHub."
```

Create it and save a local alias in one shot:

```bash
awr send --new --alias issue42 "Investigate issue #42."
```

### From a file

```bash
awr send realmseed --file task.md
```

### From stdin

```bash
cat task.md | awr send realmseed --stdin
```

### Idempotent submission

```bash
awr send realmseed \
  --idempotency-key claude-issue-42-review-v1 \
  "Review issue #42."
```

A successfully submitted key will not be submitted twice.

### Inspect a delivery

```bash
awr status <submission-id>
```

### Authentication check

```bash
awr auth
```

### UI / browser health check

```bash
awr doctor
```

Interactive diagnosis:

```bash
awr doctor --headed
```

---

## 👤 Profiles

Use a separate login/browser profile when needed:

```bash
awr login --profile work
```

Profiles are stored independently from your normal Chrome profile. The relay does not need access to the cookies from the browser you use for your bank, email, social media, or everything else that should absolutely stay out of an automation process.

A persistent browser profile can only be owned by one relay process at a time, so `agent-webui-relay` takes a **per-profile lock**.

---

## 📦 Local data

The relay data directory contains:

```text
agent-webui-relay/
├── profiles/          # dedicated Chromium profiles
├── state.json         # aliases + submission metadata + idempotency keys
└── locks/             # short-lived process locks
```

The prompt body itself is **not stored in relay state**. Submissions persist only its SHA-256 hash and character count.

| OS | Default location |
|---|---|
| Linux | `$XDG_DATA_HOME/agent-webui-relay` or `~/.local/share/agent-webui-relay` |
| macOS | `~/Library/Application Support/agent-webui-relay` |
| Windows | `%LOCALAPPDATA%\agent-webui-relay` |

Override the location with:

```bash
AGENT_WEBUI_RELAY_HOME=/path/to/data
```

---

## 🔐 Security model

The dedicated Chromium profile is an **authentication secret**. Protect the relay data directory accordingly.

The project is deliberately boring around credentials:

- passwords are not collected or stored by the CLI
- normal browser profiles are not reused
- cookies are not exported through a relay command
- prompt bodies are not persisted to relay state
- screenshots and Playwright traces are not captured by default
- authentication challenges are handed back to a human
- generated Agent Skills contain operational guidance, **not credentials**

Debug artifacts, if you add or enable them yourself, may contain conversation content.

---

## 🏗 Architecture

```text
                      ┌─────────────────────┐
                      │ Claude / Codex      │
                      │ scripts / cron / CI │
                      └──────────┬──────────┘
                                 │
                  .agents/skills │  teaches usage
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   agent-webui-relay    │
                    │                        │
                    │  aliases              │
                    │  idempotency          │
                    │  profile lock         │
                    │  delivery state       │
                    └───────────┬────────────┘
                                │
                                │ Playwright
                                ▼
                    ┌────────────────────────┐
                    │      AI Web UI         │
                    │   ChatGPT adapter      │
                    └───────────┬────────────┘
                                │
                                │ connected tools
                                ▼
                    ┌────────────────────────┐
                    │ GitHub / apps / tools  │
                    └────────────────────────┘
```

The relay's definition of success is:

> **The user's task was submitted to the intended conversation.**

Not:

> The model finished generating and we scraped its answer.

That difference is the entire project.

---

## 🧩 Provider status

| Provider | Status |
|---|---|
| ChatGPT Web | **adapter available** |
| Other AI Web UIs | Provider layer ready for future adapters |

The provider boundary is kept separate from CLI state and delivery semantics so additional Web UIs do not need to reinvent the relay.

---

## 🚦 Exit codes

| Code | Meaning |
|---:|---|
| `0` | submitted / already submitted / successful command |
| `2` | invalid CLI input / unknown submission / skill already exists |
| `10` | login required or login not confirmed |
| `11` | conversation alias not found |
| `12` | composer/input preparation failed |
| `13` | submit failed before confirmation |
| `14` | human interaction required |
| `15` | submission uncertain — do not blindly retry |
| `20` | profile/lock timeout |
| `30` | internal error |

---

## 🤝 Contributing

Issues, adapters, selector fixes, installer improvements, Agent Skill improvements, and ideas for cleaner one-way agent handoffs are welcome.

If an AI Web UI changes its DOM and the adapter stops seeing the composer, that's a particularly useful issue to report.

[Open an issue](https://github.com/NutraloxidE/agent-webui-relay/issues) · [View the source](https://github.com/NutraloxidE/agent-webui-relay)

---

## 📄 License

MIT
