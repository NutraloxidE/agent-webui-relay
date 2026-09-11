import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { RelayError } from "./errors.js";

const SKILL_NAME = "agent-webui-relay";

const SKILL_MD = `---
name: agent-webui-relay
description: Dispatch one-way tasks from an agent into AI web conversations through the local agent-webui-relay (awr) CLI. Use when work should be handed off to an AI Web UI, especially when results are expected to be left in GitHub or another shared system instead of being scraped back through the relay.
---

# Agent WebUI Relay

Use the local \`awr\` command to deliver work into an AI Web UI conversation.

## Core rule

This relay is **one-way**. It submits the user's task and returns delivery metadata. It does not return or scrape the assistant's response.

Treat a successful relay call as **task delivered**, not **task completed**.

## Before sending

1. Run \`awr doctor\` if browser/login readiness is uncertain.
2. If you know only words from the target ChatGPT conversation, search the Web UI history with \`awr sessions search "<terms>"\`. This returns only conversation titles, ids, and URLs.
3. Use \`awr chat list\` to inspect locally saved aliases when you expect the target to already have an alias.
4. Prefer an existing conversation when the task belongs to an ongoing workflow.
5. Use \`--new\` only when a new conversation is appropriate.

## Find an existing Web UI conversation

Search ChatGPT's own conversation history:

\`\`\`bash
awr sessions search "realmseed"
\`\`\`

Limit the result count when useful:

\`\`\`bash
awr sessions search "farm collapse" --limit 5
\`\`\`

The command returns JSON containing \`title\`, \`conversation_id\`, and \`conversation_url\`. It does not return message bodies or assistant output.

## Send a task

Existing conversation alias:

\`\`\`bash
awr send <alias> "<task>"
\`\`\`

Existing conversation URL discovered with session search:

\`\`\`bash
awr send "https://chatgpt.com/c/<conversation-id>" "<task>"
\`\`\`

From a file:

\`\`\`bash
awr send <alias> --file task.md
\`\`\`

From stdin:

\`\`\`bash
cat task.md | awr send <alias> --stdin
\`\`\`

New conversation:

\`\`\`bash
awr send --new "<task>"
\`\`\`

Create a new conversation and save it under a local alias:

\`\`\`bash
awr send --new --alias <alias> "<task>"
\`\`\`

## Idempotency

When the caller may retry the same logical task, provide a stable idempotency key:

\`\`\`bash
awr send <alias> \\
  --idempotency-key <stable-task-key> \\
  "<task>"
\`\`\`

Use a key derived from the logical job, issue, review, or run. Do not generate a different key for every retry.

## Interpret the result

The command writes a JSON delivery receipt to stdout.

Important statuses:

- \`submitted\`: the user message was confirmed in the target conversation.
- \`already_submitted\`: the same idempotency key was already delivered.
- \`uncertain\`: submission may have happened. **Do not blindly resend.** Inspect the delivery state or ask for human intervention.
- \`human_action_required\`: browser login or another interactive step is needed.

Inspect a delivery with:

\`\`\`bash
awr status <submission-id>
\`\`\`

## Authentication

If authentication is missing, tell the user to run:

\`\`\`bash
awr login
\`\`\`

Do not attempt to extract, export, or manipulate login cookies or credentials.

## Workflow guidance

This tool works best when the receiving AI leaves durable results somewhere both agents can access, such as:

- a GitHub commit or branch
- an issue or pull-request comment
- a file or report
- another connected shared system

When asking the receiving AI to do work, include the expected output location in the task whenever possible.

Example:

\`\`\`bash
awr send realmseed \\
  --idempotency-key issue-42-review-v1 \\
  "Review GitHub issue #42, inspect the latest branch, and leave your findings in the issue."
\`\`\`

## Safety and failure behavior

- Never assume the receiving model completed the task merely because delivery succeeded.
- Never automatically resend an \`uncertain\` submission.
- Session search may inspect ChatGPT conversation titles and URLs, but do not use this CLI as a response-scraping API.
- Do not request cookie export, CAPTCHA bypass, rate-limit bypass, or account pooling.
- Keep secrets out of prompts unless the user explicitly intends to send them to the target conversation.
`;

export interface InitAgentSkillOptions {
  directory?: string;
  force?: boolean;
}

export interface InitAgentSkillResult {
  root: string;
  skillDirectory: string;
  skillPath: string;
  displayPath: string;
}

export async function initAgentSkill(options: InitAgentSkillOptions = {}): Promise<InitAgentSkillResult> {
  const root = resolve(options.directory ?? process.cwd());

  let rootStat;
  try {
    rootStat = await stat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RelayError(
        "SKILL_TARGET_NOT_FOUND",
        `Project directory does not exist: ${root}`,
        2,
      );
    }
    throw error;
  }

  if (!rootStat.isDirectory()) {
    throw new RelayError(
      "SKILL_TARGET_NOT_DIRECTORY",
      `Skill target is not a directory: ${root}`,
      2,
    );
  }

  const skillDirectory = join(root, ".agents", "skills", SKILL_NAME);
  const skillPath = join(skillDirectory, "SKILL.md");

  await mkdir(skillDirectory, { recursive: true });

  try {
    await writeFile(skillPath, SKILL_MD, {
      encoding: "utf8",
      flag: options.force ? "w" : "wx",
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new RelayError(
        "SKILL_ALREADY_EXISTS",
        `Agent skill already exists at ${skillPath}. Use --force to overwrite it.`,
        2,
      );
    }
    throw error;
  }

  return {
    root,
    skillDirectory,
    skillPath,
    displayPath: relative(process.cwd(), skillPath) || skillPath,
  };
}
