#!/usr/bin/env node

import { Command } from "commander";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { BrowserContext } from "playwright";
import { initAgentSkill } from "./agent-skill.js";
import { openBrowser } from "./browser.js";
import { RelayError, errorPayload, exitCodeFor } from "./errors.js";
import { acquireLock } from "./lock.js";
import { ChatGPTProvider } from "./providers/chatgpt.js";
import { loadState, updateState } from "./store.js";
import type { ConversationRecord, SubmissionRecord } from "./types.js";

const provider = new ChatGPTProvider();
const dangerousMapKeys = new Set(["__proto__", "prototype", "constructor"]);

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function now(): string {
  return new Date().toISOString();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function validateProfileId(value: string): string {
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(value) || value === "." || value === "..") {
    throw new RelayError(
      "INVALID_PROFILE_ID",
      "Profile ids may contain only letters, numbers, dot, underscore, and hyphen.",
      2,
    );
  }
  return value;
}

function validateMapKey(value: string, label: string, maxLength = 256): string {
  if (!value || value.length > maxLength || dangerousMapKeys.has(value)) {
    throw new RelayError("INVALID_KEY", `Invalid ${label}.`, 2);
  }
  return value;
}

function validateAlias(value: string): string {
  validateMapKey(value, "conversation alias", 64);
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new RelayError(
      "INVALID_ALIAS",
      "Conversation aliases may contain only letters, numbers, dot, underscore, and hyphen.",
      2,
    );
  }
  return value;
}

function parseConversationUrl(url: string): { id?: string; url: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RelayError("INVALID_CONVERSATION_URL", `Invalid URL: ${url}`, 2);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "chatgpt.com") {
    throw new RelayError(
      "INVALID_CONVERSATION_URL",
      "ChatGPT conversations must use https://chatgpt.com/ URLs.",
      2,
    );
  }
  const match = /\/c\/([^/?#]+)/.exec(parsed.pathname);
  if (!match) {
    throw new RelayError(
      "INVALID_CONVERSATION_URL",
      "Expected a ChatGPT conversation URL containing /c/<conversation-id>.",
      2,
    );
  }
  return { id: match[1], url: parsed.toString() };
}

async function readAllStdin(): Promise<string> {
  let value = "";
  for await (const chunk of process.stdin) value += chunk.toString();
  return value;
}

async function resolveText(
  message: string[],
  options: { file?: string; stdin?: boolean; new?: boolean },
  rawTarget?: string,
): Promise<{ text: string; target?: string }> {
  let target = rawTarget;
  let inline = message.join(" ");

  // Ergonomic special case: `awr send --new "prompt"`.
  if (options.new && target && !inline && !options.file && !options.stdin) {
    inline = target;
    target = undefined;
  }

  const explicitInputs =
    Number(Boolean(inline)) + Number(Boolean(options.file)) + Number(Boolean(options.stdin));
  if (explicitInputs > 1) {
    throw new RelayError("MULTIPLE_INPUTS", "Use exactly one of inline text, --file, or --stdin.", 2);
  }

  let text = inline;
  if (options.file) text = await readFile(options.file, "utf8");
  if (options.stdin || (!text && !process.stdin.isTTY)) text = await readAllStdin();
  if (!text) throw new RelayError("EMPTY_INPUT", "No task text was provided.", 2);

  return { text, target };
}

async function setSubmissionStatus(
  submissionId: string,
  status: SubmissionRecord["status"],
  patch: Partial<SubmissionRecord> = {},
): Promise<void> {
  await updateState((state) => {
    const current = state.submissions[submissionId];
    if (!current) return;
    state.submissions[submissionId] = { ...current, ...patch, status };
  });
}

const program = new Command();
program
  .name("agent-webui-relay")
  .description("One-way task relay from agents/CLI tools into AI web interfaces.")
  .version("0.2.0");

program
  .command("init-skill")
  .description("Install a portable Agent Skills SKILL.md into a project.")
  .argument("[directory]", "project directory", ".")
  .option("--force", "overwrite an existing agent-webui-relay skill", false)
  .action(async (directory: string, options: { force: boolean }) => {
    const result = await initAgentSkill({ directory, force: options.force });
    print({
      ok: true,
      status: "installed",
      format: "Agent Skills / SKILL.md",
      skill: {
        name: "agent-webui-relay",
        path: result.displayPath,
        absolute_path: result.skillPath,
      },
    });
  });

program
  .command("login")
  .description("Open a dedicated persistent browser profile and log in manually.")
  .option("--profile <id>", "profile id", "default")
  .action(async (options: { profile: string }) => {
    const profileId = validateProfileId(options.profile);
    const release = await acquireLock(`profile-${profileId}`);
    let context: BrowserContext | undefined;
    try {
      const session = await openBrowser(profileId, false);
      context = session.context;
      await provider.open(session.page);

      if (!(await provider.ensureReady(session.page, 3_000))) {
        process.stderr.write(
          "Complete login in the opened browser. When the ChatGPT composer is visible, return here and press Enter.\n",
        );
        const rl = createInterface({ input, output });
        await rl.question("");
        rl.close();
      }

      const authenticated = await provider.ensureReady(session.page, 10_000);
      if (!authenticated) {
        throw new RelayError(
          "LOGIN_NOT_CONFIRMED",
          "ChatGPT composer was not detected after login.",
          10,
        );
      }
      print({ ok: true, status: "authenticated", provider: "chatgpt", profile_id: profileId });
    } finally {
      await context?.close().catch(() => undefined);
      await release();
    }
  });

const chat = program.command("chat").description("Manage local conversation aliases.");

chat
  .command("add")
  .argument("<alias>")
  .argument("<url>")
  .option("--profile <id>", "profile id", "default")
  .action(async (rawAlias: string, url: string, options: { profile: string }) => {
    const alias = validateAlias(rawAlias);
    const profileId = validateProfileId(options.profile);
    const parsed = parseConversationUrl(url);
    const timestamp = now();
    const record: ConversationRecord = {
      alias,
      provider: "chatgpt",
      profileId,
      conversationId: parsed.id,
      conversationUrl: parsed.url,
      createdAt: timestamp,
      lastUsedAt: timestamp,
    };
    await updateState((state) => {
      state.conversations[alias] = record;
    });
    print({ ok: true, status: "saved", conversation: record });
  });

chat.command("list").action(async () => {
  const state = await loadState();
  print({ ok: true, conversations: Object.values(state.conversations) });
});

chat
  .command("remove")
  .argument("<alias>")
  .action(async (rawAlias: string) => {
    const alias = validateAlias(rawAlias);
    let removed = false;
    await updateState((state) => {
      removed = Boolean(state.conversations[alias]);
      delete state.conversations[alias];
    });
    print({ ok: true, status: removed ? "removed" : "not_found", alias });
  });

program
  .command("status")
  .argument("<submission-id>")
  .action(async (submissionId: string) => {
    const state = await loadState();
    const submission = state.submissions[submissionId];
    if (!submission) throw new RelayError("SUBMISSION_NOT_FOUND", "Unknown submission id.", 2);
    print({ ok: true, submission });
  });

program
  .command("auth")
  .description("Check whether a profile currently reaches an authenticated composer.")
  .option("--profile <id>", "profile id", "default")
  .option("--headed", "show the browser", false)
  .action(async (options: { profile: string; headed: boolean }) => {
    const profileId = validateProfileId(options.profile);
    const release = await acquireLock(`profile-${profileId}`);
    let context: BrowserContext | undefined;
    try {
      const session = await openBrowser(profileId, !options.headed);
      context = session.context;
      await provider.open(session.page);
      const authenticated = await provider.ensureReady(session.page, 8_000);
      print({ ok: true, provider: "chatgpt", profile_id: profileId, authenticated });
      if (!authenticated) process.exitCode = 10;
    } finally {
      await context?.close().catch(() => undefined);
      await release();
    }
  });

program
  .command("doctor")
  .description("Check browser/profile/UI readiness without sending a message.")
  .option("--profile <id>", "profile id", "default")
  .option("--headed", "show the browser", false)
  .action(async (options: { profile: string; headed: boolean }) => {
    const profileId = validateProfileId(options.profile);
    const release = await acquireLock(`profile-${profileId}`);
    let context: BrowserContext | undefined;
    try {
      const session = await openBrowser(profileId, !options.headed);
      context = session.context;
      await provider.open(session.page);
      const composerDetected = await provider.ensureReady(session.page, 8_000);
      print({
        ok: composerDetected,
        status: composerDetected ? "ready" : "human_action_required",
        checks: {
          browser: true,
          profile: profileId,
          provider: "chatgpt",
          composer_detected: composerDetected,
        },
      });
      if (!composerDetected) process.exitCode = 14;
    } finally {
      await context?.close().catch(() => undefined);
      await release();
    }
  });

program
  .command("send")
  .description("Submit one task to ChatGPT Web. Assistant output is never extracted.")
  .argument("[target]", "conversation alias or ChatGPT conversation URL")
  .argument("[message...]", "task text")
  .option("--new", "start a new conversation", false)
  .option("--alias <alias>", "save a new conversation under this alias")
  .option("--file <path>", "read task text from a UTF-8 file")
  .option("--stdin", "read task text from stdin", false)
  .option("--profile <id>", "override profile id")
  .option("--idempotency-key <key>", "prevent duplicate submission for a caller-defined key")
  .option("--headed", "show the browser", false)
  .action(async (
    rawTarget: string | undefined,
    message: string[],
    options: {
      new: boolean;
      alias?: string;
      file?: string;
      stdin: boolean;
      profile?: string;
      idempotencyKey?: string;
      headed: boolean;
    },
  ) => {
    const resolved = await resolveText(message, options, rawTarget);
    if (!options.new && !resolved.target) {
      throw new RelayError("TARGET_REQUIRED", "Provide a conversation alias/URL or use --new.", 2);
    }
    if (options.alias && !options.new) {
      throw new RelayError("ALIAS_REQUIRES_NEW", "--alias can only be used with --new.", 2);
    }

    const newAlias = options.alias ? validateAlias(options.alias) : undefined;
    const idempotencyKey = options.idempotencyKey
      ? validateMapKey(options.idempotencyKey, "idempotency key", 512)
      : undefined;

    const state = await loadState();
    let conversation: ConversationRecord | undefined;
    let conversationUrl: string | undefined;

    if (!options.new && resolved.target) {
      if (/^https?:\/\//i.test(resolved.target)) {
        conversationUrl = parseConversationUrl(resolved.target).url;
      } else {
        const alias = validateAlias(resolved.target);
        conversation = state.conversations[alias];
        if (!conversation) {
          throw new RelayError(
            "CONVERSATION_NOT_FOUND",
            `Unknown conversation alias: ${alias}`,
            11,
          );
        }
        conversationUrl = conversation.conversationUrl;
      }
    }

    const profileId = validateProfileId(options.profile ?? conversation?.profileId ?? "default");

    if (idempotencyKey) {
      const previousId = state.idempotency[idempotencyKey];
      const previous = previousId ? state.submissions[previousId] : undefined;
      if (previous && ["submitted", "submit_started", "uncertain"].includes(previous.status)) {
        print({
          ok: previous.status === "submitted",
          status: previous.status === "submitted" ? "already_submitted" : previous.status,
          submission: previous,
        });
        if (previous.status !== "submitted") process.exitCode = 15;
        return;
      }
    }

    const submissionId = randomUUID();
    const createdAt = now();
    const submission: SubmissionRecord = {
      submissionId,
      idempotencyKey,
      provider: "chatgpt",
      profileId,
      conversationId: conversation?.conversationId,
      conversationUrl,
      promptSha256: sha256(resolved.text),
      promptLength: resolved.text.length,
      status: "queued",
      attempt: 1,
      createdAt,
    };

    await updateState((current) => {
      current.submissions[submissionId] = submission;
      if (idempotencyKey) current.idempotency[idempotencyKey] = submissionId;
    });

    let release: (() => Promise<void>) | undefined;
    let context: BrowserContext | undefined;
    let submitStarted = false;

    try {
      try {
        release = await acquireLock(`profile-${profileId}`);
      } catch (error) {
        await setSubmissionStatus(submissionId, "failed", {
          errorCode: error instanceof RelayError ? error.code : "PROFILE_LOCK_FAILED",
        });
        throw error;
      }

      await setSubmissionStatus(submissionId, "opening");
      const session = await openBrowser(profileId, !options.headed);
      context = session.context;
      await provider.open(session.page, conversationUrl);

      if (!(await provider.ensureReady(session.page, 15_000))) {
        await setSubmissionStatus(submissionId, "human_action_required", { errorCode: "LOGIN_REQUIRED" });
        throw new RelayError(
          "LOGIN_REQUIRED",
          "ChatGPT composer is unavailable. Run `agent-webui-relay login` for this profile.",
          10,
        );
      }

      await setSubmissionStatus(submissionId, "ready");
      await setSubmissionStatus(submissionId, "typing");
      await provider.prepareSubmission(session.page, resolved.text);

      submitStarted = true;
      await setSubmissionStatus(submissionId, "submit_started", { submitStartedAt: now() });
      const committed = await provider.commitSubmission(session.page, resolved.text);

      if (options.new) {
        await session.page.waitForURL(/\/c\//, { timeout: 10_000 }).catch(() => undefined);
      }

      const reference = await provider.conversationReference(session.page);
      if (!reference.conversationId && options.new) {
        throw new RelayError(
          "CONVERSATION_ID_NOT_OBSERVED",
          "Message was submitted but the new conversation URL could not be observed.",
          15,
        );
      }

      const submittedAt = now();
      await setSubmissionStatus(submissionId, "submitted", {
        conversationId: reference.conversationId ?? conversation?.conversationId,
        conversationUrl: reference.conversationUrl,
        submittedAt,
      });

      if (conversation) {
        await updateState((current) => {
          const existing = current.conversations[conversation!.alias];
          if (existing) {
            existing.lastUsedAt = submittedAt;
            existing.conversationUrl = reference.conversationUrl;
            existing.conversationId = reference.conversationId ?? existing.conversationId;
          }
        });
      }

      if (newAlias && options.new) {
        const aliasRecord: ConversationRecord = {
          alias: newAlias,
          provider: "chatgpt",
          profileId,
          conversationId: reference.conversationId,
          conversationUrl: reference.conversationUrl,
          createdAt: submittedAt,
          lastUsedAt: submittedAt,
        };
        await updateState((current) => {
          current.conversations[newAlias] = aliasRecord;
        });
      }

      print({
        ok: true,
        status: "submitted",
        submission_id: submissionId,
        profile_id: profileId,
        target: {
          conversation_alias: conversation?.alias ?? newAlias,
          conversation_id: reference.conversationId ?? conversation?.conversationId,
          conversation_url: reference.conversationUrl,
        },
        submitted_at: submittedAt,
        confirmed_by: committed.confirmedBy,
        attempt: 1,
      });
    } catch (error) {
      if (submitStarted) {
        await setSubmissionStatus(submissionId, "uncertain", {
          errorCode: error instanceof RelayError ? error.code : "UNKNOWN_AFTER_SUBMIT",
        }).catch(() => undefined);
        if (!(error instanceof RelayError && error.exitCode === 15)) {
          throw new RelayError(
            "SUBMISSION_UNCERTAIN",
            "An error occurred after submit started. Blind retry is intentionally disabled.",
            15,
            { submissionId },
          );
        }
      } else if (!(error instanceof RelayError && error.code === "LOGIN_REQUIRED")) {
        await setSubmissionStatus(submissionId, "failed", {
          errorCode: error instanceof RelayError ? error.code : "SUBMISSION_FAILED",
        }).catch(() => undefined);
      }
      throw error;
    } finally {
      await context?.close().catch(() => undefined);
      await release?.();
    }
  });

program.parseAsync(process.argv).catch((error) => {
  print(errorPayload(error));
  process.exitCode = exitCodeFor(error);
});
