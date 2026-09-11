<div align="center">

# agent-webui-relay

### AI Web UIをAPI化せず、エージェントから仕事だけを投げ込む。

**PlaywrightでAI Web UIへ一方向にタスクを配送する、エージェント・スクリプト・cron・変な自動化グラフ向けリレー。**

[English](./README.md) | **日本語**

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

> **入力を自動化する。出力は抽出しない。**

`agent-webui-relay` は専用ブラウザプロファイルを開き、AIの会話画面へ移動し、タスクを投稿し、**自分のメッセージが送信されたこと**だけを確認して、機械可読な配送結果を返します。

アシスタントの返答をスクレイピング・ストリーミング・プロキシ・返却する機能は、意図的に実装していません。

[クイックスタート](#-クイックスタート) · [Agent Skill](#-agent-skillを追加する) · [仕組み](#-仕組み) · [CLI](#-cli) · [セキュリティ](#-セキュリティモデル) · [アーキテクチャ](#-アーキテクチャ)

</div>

---

## ⚡ なぜ作ったのか

コードを書ける。ブランチをレビューできる。GitHub Issueを作れる。テストを回せる。成果物を残せる。

そんなエージェントがすでに複数いるのに、最後に足りないのが妙に単純なことがあります。

> **「Agent Aから、Agent Bが使っているWeb UIへ、どうやって仕事を投げる？」**

`agent-webui-relay` は、その隙間を埋めるための道具です。

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

リレーは配送が終わった時点で終了します。**Web UI側の返答をリレー経由で持ち帰ることはありません。**

---

## ✨ 特徴

- AI Web UIへの**一方向タスク配送**
- `awr init-skill` による**portable Agent Skills導入**
- **専用persistent Chromium profile** — 一度ログインして、そのセッションを再利用
- **会話alias** — UUIDを毎回貼る代わりに `realmseed` のような名前で指定
- stdoutに**機械可読JSON receipt**を出力
- **idempotency key**で事故的な二重実行を防止
- **at-most-once寄りの配送設計** — あいまいな送信は自動再試行せず `uncertain`
- **prompt本文を保存しない** — stateにはSHA-256と文字数だけ保存
- 複数caller向けの**profile lock**
- inline / stdin / fileからprompt入力
- macOS / Linux向け `install.sh`
- Windows向け `install.ps1`
- 長い `agent-webui-relay` と、短い **`awr`** の両方を利用可能
- provider層を分離し、将来ほかのAI Web UI adapterを追加可能

### 意図的に実装しないもの

`agent-webui-relay` は、assistant responseのスクレイピング、response streaming、OpenAI互換response API、cookie export、account pooling、CAPTCHA bypass、rate-limit bypass、challengeの自動回避を実装しません。

---

## 🚀 クイックスタート

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

インストーラは依存関係、Playwright Chromium、TypeScript buildを処理し、次の2コマンドを使えるようにします。

```text
agent-webui-relay
awr
```

### 3. 一度だけログイン

```bash
awr login
```

専用Chromium profileが開くので、通常通りChatGPTへログインします。

**メールアドレスやパスワードはこのプロジェクトでは保存しません。** persistent browser profile自体が認証情報を含むため、秘密として扱ってください。

### 4. 今いるrepoのagentに使い方を教える

agentが作業するprojectへ移動して、

```bash
cd /path/to/your-project
awr init-skill
```

すると、

```text
.agents/
└── skills/
    └── agent-webui-relay/
        └── SKILL.md
```

が生成されます。

生成されるskillはportable Agent Skillsの`SKILL.md`形式で、`name` / `description` のYAML frontmatterと、agentが`awr`を安全に扱うための実務手順を含みます。

### 5. 会話aliasを保存

```bash
awr chat add realmseed https://chatgpt.com/c/<conversation-id>
```

### 6. 撃つ

```bash
awr send realmseed "GitHubを確認してClaudeから来ている最新タスクを実行して"
```

返るのは回答本文ではなく、配送receiptです。

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

**仕事を届ける。receiptを返す。assistant response本文は抽出しない。**

---

## 🧩 Agent Skillを追加する

`v0.2` では、このCLI自身の使い方をportable Agent Skillとしてprojectへ導入できます。

agentが作業するproject内で、

```bash
awr init-skill
```

デフォルトの生成先は、

```text
./.agents/skills/agent-webui-relay/SKILL.md
```

別projectを指定することもできます。

```bash
awr init-skill ../other-project
```

既存skillは勝手に上書きしません。

```bash
awr init-skill
# -> SKILL_ALREADY_EXISTS
```

本当に更新したい場合のみ、

```bash
awr init-skill --force
```

を使います。

生成されるskillはagentへ次を教えます。

- `awr doctor` でbrowser/login状態を確認
- `awr chat list` で既存aliasを確認
- inline / file / stdin / new conversationでタスク配送
- 再試行されうるlogical jobにはstableなidempotency keyを使う
- `submitted` を**完了**ではなく**配送済み**として扱う
- `uncertain` を自動再送しない
- 認証が必要なら人間へ `awr login` を依頼
- GitHub commit / Issue / PR comment / fileなど、両agentが読めるdurable outputを指定する

skillには認証情報やcookieは入りません。**使い方だけがprojectへ入ります。**

---

## 🧠 仕組み

`agent-webui-relay` は、似ているけれど別物なIDを混ぜません。

| 概念 | 意味 | 例 |
|---|---|---|
| `profile_id` | ローカルのbrowser/login profile | `default` |
| `conversation_id` | AI Web UI上の会話 | ChatGPT `/c/<id>` |
| `submission_id` | 一回の配送試行 | UUID |
| `idempotency_key` | callerが決める二重送信防止key | `claude-issue-42-v1` |

何でもかんでも`session_id`と呼ぶ設計にはしていません。

### 配送state machine

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
  ├──────────────► uncertain   # 送信された可能性あり。blind retry禁止
  │
  ▼
submitted
```

`submit_started` より前なら普通のfailureです。

`submit_started` より後は話が変わります。配送成功を証明できない場合、同じ仕事を二回投げるより **`uncertain`** に倒します。

---

## 🛠 CLI

### portable Agent Skillを追加

```bash
awr init-skill
```

```bash
awr init-skill ../other-project
```

```bash
awr init-skill --force
```

### 既存会話へ送る

```bash
awr send realmseed "最新branchをレビューして"
```

URL直指定も可能です。

```bash
awr send https://chatgpt.com/c/<conversation-id> "最新branchをレビューして"
```

### 新規会話

```bash
awr send --new "Issue #42を調査して結果をGitHubへ残して"
```

新規会話を作りつつaliasも保存できます。

```bash
awr send --new --alias issue42 "Issue #42を調査して"
```

### fileから送る

```bash
awr send realmseed --file task.md
```

### stdinから送る

```bash
cat task.md | awr send realmseed --stdin
```

### idempotency付き

```bash
awr send realmseed \
  --idempotency-key claude-issue-42-review-v1 \
  "Issue #42をレビューして"
```

### 配送状態確認

```bash
awr status <submission-id>
```

### 認証確認

```bash
awr auth
```

### browser / UI health check

```bash
awr doctor
```

画面を出して診断する場合、

```bash
awr doctor --headed
```

---

## 👤 Profiles

別login/browser profileを使う場合、

```bash
awr login --profile work
```

profileは普段使っているChromeとは分離されます。銀行、メール、SNSなどのcookieまでautomation processへ渡す必要はありません。

同じpersistent browser profileを複数processで同時所有できないため、`agent-webui-relay` はprofileごとにlockを取ります。

---

## 📦 ローカルデータ

```text
agent-webui-relay/
├── profiles/          # 専用Chromium profiles
├── state.json         # aliases + submission metadata + idempotency keys
└── locks/             # process locks
```

prompt本文そのものはrelay stateへ保存しません。保存するのはSHA-256と文字数です。

| OS | デフォルト保存先 |
|---|---|
| Linux | `$XDG_DATA_HOME/agent-webui-relay` または `~/.local/share/agent-webui-relay` |
| macOS | `~/Library/Application Support/agent-webui-relay` |
| Windows | `%LOCALAPPDATA%\agent-webui-relay` |

変更する場合、

```bash
AGENT_WEBUI_RELAY_HOME=/path/to/data
```

---

## 🔐 セキュリティモデル

専用Chromium profileは**認証secret**です。relay data directoryを適切に保護してください。

credential周りは意図的に地味にしています。

- passwordをCLIが収集・保存しない
- 普段使いのbrowser profileを再利用しない
- cookieをrelay commandでexportしない
- prompt本文をrelay stateへ保存しない
- screenshot / Playwright traceをデフォルト保存しない
- 認証challengeは人間へ返す
- `awr init-skill` が生成するのは運用手順だけで、credentialは含めない

---

## 🏗 アーキテクチャ

```text
                      ┌─────────────────────┐
                      │ Claude / Codex      │
                      │ scripts / cron / CI │
                      └──────────┬──────────┘
                                 │
                  .agents/skills │  使い方を教える
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

relayにとっての成功条件は、

> **ユーザーのtaskが、意図したconversationへ投稿された。**

です。

> modelが生成を終えて、その回答をscrapeできた。

ではありません。

**この差がプロジェクトの全部です。**

---

## 🧩 Provider状況

| Provider | 状況 |
|---|---|
| ChatGPT Web | **adapterあり** |
| その他AI Web UI | 将来adapterを追加できるprovider layerあり |

---

## 🚦 Exit codes

| Code | 意味 |
|---:|---|
| `0` | submitted / already submitted / command成功 |
| `2` | CLI入力不正 / submission不明 / skill既存 |
| `10` | login required / login未確認 |
| `11` | conversation aliasが見つからない |
| `12` | composer/input準備失敗 |
| `13` | confirmation前のsubmit失敗 |
| `14` | human interaction required |
| `15` | submission uncertain — blind retry禁止 |
| `20` | profile/lock timeout |
| `30` | internal error |

---

## 🤝 Contributing

Issue、adapter、selector修正、installer改善、Agent Skill改善、一方向agent handoffをもっと綺麗にするアイデアを歓迎します。

AI Web UIのDOM変更でcomposerを見失った場合も、有用なIssueです。

[Issueを開く](https://github.com/NutraloxidE/agent-webui-relay/issues) · [ソースを見る](https://github.com/NutraloxidE/agent-webui-relay)

---

## 📄 License

MIT
