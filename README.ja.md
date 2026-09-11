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
![Status](https://img.shields.io/badge/status-v0.1%20experimental-orange?style=flat-square)

<br />

> **入力を自動化する。出力は抽出しない。**

`agent-webui-relay` は専用ブラウザプロファイルを開き、AIの会話画面へ移動し、タスクを投稿し、**自分のメッセージが送信されたこと**だけを確認して、機械可読な配送結果を返します。

アシスタントの返答をスクレイピング・ストリーミング・プロキシ・返却する機能は、意図的に実装していません。

[クイックスタート](#-クイックスタート) · [仕組み](#-仕組み) · [CLI](#-cli) · [セキュリティ](#-セキュリティモデル) · [アーキテクチャ](#-アーキテクチャ)

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

### 意図的に実装していないもの

`agent-webui-relay` は、assistant response scraping、response streaming、OpenAI互換response API、cookie export、account pooling、CAPTCHA回避、rate-limit回避、自動challenge回避を実装しません。

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

installerは依存関係を導入し、Playwright Chromiumをダウンロードし、TypeScriptをbuildして次のコマンドを使えるようにします。

```text
agent-webui-relay
awr
```

### 3. 一度だけログイン

```bash
awr login
```

専用Chromium profileが開きます。通常どおりChatGPTへログインしてください。

**このプロジェクトはメールアドレスやパスワードを保存しません。** 認証状態はpersistent browser profileそのものに残るため、そのディレクトリ自体を秘密情報として扱ってください。

### 4. 会話へaliasを付ける

```bash
awr chat add realmseed https://chatgpt.com/c/<conversation-id>
```

### 5. 撃つ

```bash
awr send realmseed "GitHubを確認してClaudeから来ている最新タスクを実行して"
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

これが契約です。

**仕事を届ける。配送receiptを返す。assistant response本文は抽出しない。**

---

## 🧠 仕組み

`agent-webui-relay` は次の識別子を明確に分けます。

| 概念 | 意味 | 例 |
|---|---|---|
| `profile_id` | ローカルのブラウザ / ログインprofile | `default` |
| `conversation_id` | AI Web UI上の会話 | ChatGPT `/c/<id>` |
| `submission_id` | リレーによる一回の配送試行 | UUID |
| `idempotency_key` | callerが指定する二重実行防止キー | `claude-issue-42-v1` |

何でもかんでも押し込む汎用 `session_id` は、意図的に作っていません。

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
  ├──────────────► uncertain   # 届いた可能性があるためblind retryしない
  │
  ▼
submitted
```

`submit_started` より前の失敗は、ただの失敗です。

`submit_started` より後は違います。実際には届いている可能性があるため、配送成功を証明できない場合は自動的に同じタスクをもう一度送らず、**`uncertain`** にします。

---

## 🛠 CLI

### 既存の会話へ送る

```bash
awr send realmseed "最新branchをレビューして"
```

ChatGPT conversation URLを直接指定することもできます。

```bash
awr send https://chatgpt.com/c/<conversation-id> "最新branchをレビューして"
```

### 新しい会話を作る

```bash
awr send --new "Issue #42を調査して結果をGitHubへ残して"
```

作成と同時にローカルaliasを保存する場合:

```bash
awr send --new --alias issue42 "Issue #42を調査して"
```

### ファイルから送る

```bash
awr send realmseed --file task.md
```

### stdinから送る

```bash
cat task.md | awr send realmseed --stdin
```

### idempotentな送信

```bash
awr send realmseed \
  --idempotency-key claude-issue-42-review-v1 \
  "Issue #42をレビューして"
```

一度正常に送信されたキーは二重送信されません。

### 配送状態を見る

```bash
awr status <submission-id>
```

### 認証状態を確認

```bash
awr auth
```

### UI / browser health check

```bash
awr doctor
```

画面を表示して診断する場合:

```bash
awr doctor --headed
```

---

## 👤 Profiles

別のログイン / browser profileを使う場合:

```bash
awr login --profile work
```

profileは普段使いのChrome profileとは完全に別に保存されます。銀行・メール・SNSなどの日常ブラウザCookieをautomation processへ渡す必要はありません。

persistent browser profileは同時に一つのrelay processだけが所有できるため、`agent-webui-relay` は**profile単位でlock**を取得します。

---

## 📦 ローカルデータ

データディレクトリは次のような構成です。

```text
agent-webui-relay/
├── profiles/          # 専用Chromium profiles
├── state.json         # aliases + submission metadata + idempotency keys
└── locks/             # 短命なprocess lock
```

prompt本文は**relay stateへ保存されません**。submissionにはSHA-256 hashと文字数だけを保存します。

| OS | デフォルト保存先 |
|---|---|
| Linux | `$XDG_DATA_HOME/agent-webui-relay` または `~/.local/share/agent-webui-relay` |
| macOS | `~/Library/Application Support/agent-webui-relay` |
| Windows | `%LOCALAPPDATA%\agent-webui-relay` |

保存先を変更する場合:

```bash
AGENT_WEBUI_RELAY_HOME=/path/to/data
```

---

## 🔐 セキュリティモデル

専用Chromium profileは**認証情報そのもの**として扱ってください。relay data directoryを適切に保護してください。

認証情報まわりは意図的に退屈な設計にしています。

- CLIはパスワードを収集・保存しない
- 普段使いのbrowser profileを再利用しない
- relay commandからcookieをexportしない
- prompt本文をrelay stateへ永続化しない
- screenshot / Playwright traceをデフォルトでは保存しない
- authentication challengeは人間へ返す

自分でdebug artifactを有効化した場合、それらには会話内容が含まれる可能性があります。

---

## 🏗 アーキテクチャ

```text
                      ┌─────────────────────┐
                      │ Claude / Codex      │
                      │ scripts / cron / CI │
                      └──────────┬──────────┘
                                 │
                                 │ CLI task
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
                    │   ChatGPT (v0.1)       │
                    └───────────┬────────────┘
                                │
                                │ connected tools
                                ▼
                    ┌────────────────────────┐
                    │ GitHub / apps / tools  │
                    └────────────────────────┘
```

relayが成功と定義するのは、

> **ユーザーのタスクが、意図した会話へ投稿された。**

という状態です。

次ではありません。

> モデルが生成を完了し、その答えをスクレイピングできた。

この違いが、このプロジェクトそのものです。

---

## 🧩 Provider status

| Provider | Status |
|---|---|
| ChatGPT Web | **v0.1 adapter** |
| その他AI Web UI | 将来adapterを追加できるprovider layerあり |

provider境界はCLI stateやdelivery semanticsから分離しています。そのため別Web UIを追加するときもrelay自体を作り直す必要はありません。

---

## 🚦 Exit codes

| Code | 意味 |
|---:|---|
| `0` | submitted / already submitted / command成功 |
| `2` | CLI入力不正 / submission不明 |
| `10` | login required / login未確認 |
| `11` | conversation aliasが見つからない |
| `12` | composer / input準備に失敗 |
| `13` | confirmation前にsubmit失敗 |
| `14` | 人間による操作が必要 |
| `15` | submission uncertain — blind retry禁止 |
| `20` | profile / lock timeout |
| `30` | internal error |

---

## 🤝 Contributing

Issue、adapter追加、selector修正、installer改善、より綺麗な一方向agent handoffのアイデアを歓迎します。

AI Web UI側のDOM変更でcomposerを見つけられなくなった場合も、かなりありがたいIssueです。

[Issueを開く](https://github.com/NutraloxidE/agent-webui-relay/issues) · [ソースを見る](https://github.com/NutraloxidE/agent-webui-relay)

---

## 📄 License

MIT
