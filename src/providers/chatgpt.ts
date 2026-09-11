import type { Locator, Page } from "playwright";
import { RelayError } from "../errors.js";
import type { AIWebProvider, CommitResult } from "./types.js";
import type { ConversationReference } from "../types.js";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export class ChatGPTProvider implements AIWebProvider {
  readonly name = "chatgpt";
  readonly homeUrl = "https://chatgpt.com/";

  async open(page: Page, conversationUrl?: string): Promise<void> {
    await page.goto(conversationUrl ?? this.homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  }

  private async composer(page: Page): Promise<Locator | null> {
    const candidates = [
      page.locator("#prompt-textarea:visible").first(),
      page.locator('textarea:visible').first(),
      page.locator('[contenteditable="true"][data-lexical-editor="true"]:visible').first(),
      page.locator('[contenteditable="true"]:visible').first(),
    ];

    for (const candidate of candidates) {
      try {
        if ((await candidate.count()) > 0 && (await candidate.isVisible())) return candidate;
      } catch {
        // Try the next resilient locator.
      }
    }
    return null;
  }

  private async sendButton(page: Page): Promise<Locator | null> {
    const candidates = [
      page.locator('button[data-testid="send-button"]:visible').first(),
      page.locator('button[aria-label*="Send"]:visible').first(),
      page.locator('button[aria-label*="send"]:visible').first(),
      page.locator('button[aria-label*="送信"]:visible').first(),
      page.locator('form button[type="submit"]:visible').first(),
    ];

    for (const candidate of candidates) {
      try {
        if ((await candidate.count()) > 0 && (await candidate.isVisible())) return candidate;
      } catch {
        // Try the next resilient locator.
      }
    }
    return null;
  }

  private async composerText(locator: Locator): Promise<string> {
    return locator.evaluate((element) => {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        return element.value;
      }
      return element.textContent ?? "";
    });
  }

  async ensureReady(page: Page, timeoutMs = 15_000): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.composer(page)) return true;
      await sleep(250);
    }
    return false;
  }

  async prepareSubmission(page: Page, text: string, timeoutMs = 15_000): Promise<void> {
    const composer = await this.composer(page);
    if (!composer) {
      throw new RelayError(
        "COMPOSER_NOT_FOUND",
        "Could not find the ChatGPT composer. Login or UI interaction may be required.",
        12,
      );
    }

    await composer.fill(text, { timeout: timeoutMs });
    const actual = await this.composerText(composer);
    if (normalize(actual) !== normalize(text)) {
      throw new RelayError(
        "COMPOSER_MISMATCH",
        "Composer contents did not match the requested input.",
        12,
      );
    }
  }

  async commitSubmission(page: Page, text: string, timeoutMs = 15_000): Promise<CommitResult> {
    const composer = await this.composer(page);
    if (!composer) {
      throw new RelayError("COMPOSER_NOT_FOUND", "Composer disappeared before submit.", 13);
    }

    const button = await this.sendButton(page);
    if (button) {
      await button.click({ timeout: timeoutMs });
    } else {
      await composer.press("Enter", { timeout: timeoutMs });
    }

    const sample = normalize(text).slice(0, 160);
    const started = Date.now();
    let cleared = false;

    while (Date.now() - started < timeoutMs) {
      try {
        const currentComposer = await this.composer(page);
        if (currentComposer) {
          cleared = normalize(await this.composerText(currentComposer)).length === 0;
        }

        const users = page.locator('[data-message-author-role="user"]');
        const count = await users.count();
        if (count > 0) {
          const latest = normalize(await users.nth(count - 1).innerText());
          if (!sample || latest.includes(sample)) {
            return { confirmedBy: "user_message" };
          }
        }

        if (cleared && Date.now() - started > 1_500) {
          return { confirmedBy: "composer_cleared" };
        }
      } catch {
        // Keep waiting for a stable post-submit state.
      }
      await sleep(250);
    }

    throw new RelayError(
      "SUBMIT_NOT_CONFIRMED",
      "Submit was initiated but could not be confirmed. It may have been delivered.",
      15,
    );
  }

  async conversationReference(page: Page): Promise<ConversationReference> {
    const url = page.url();
    const match = /\/c\/([^/?#]+)/.exec(url);
    return {
      conversationId: match?.[1],
      conversationUrl: url,
    };
  }
}
