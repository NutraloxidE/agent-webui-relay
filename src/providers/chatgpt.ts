import type { Locator, Page } from "playwright";
import { RelayError } from "../errors.js";
import type { AIWebProvider, CommitResult } from "./types.js";
import type { ConversationReference, WebSessionSearchResult } from "../types.js";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const value = normalize(line);
    if (value) return value;
  }
  return "";
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
      page.locator("textarea:visible").first(),
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

  private async searchInput(page: Page): Promise<Locator | null> {
    const dialog = page.locator('[role="dialog"]:visible').last();
    const candidates = [
      dialog.getByRole("textbox").first(),
      page.locator('input[type="search"]:visible').first(),
      page.locator('input[placeholder*="Search"]:visible').first(),
      page.locator('input[placeholder*="search"]:visible').first(),
      page.locator('input[placeholder*="検索"]:visible').first(),
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

  private async waitForSearchInput(page: Page, timeoutMs: number): Promise<Locator | null> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const input = await this.searchInput(page);
      if (input) return input;
      await sleep(150);
    }
    return null;
  }

  private async openSessionSearch(page: Page, timeoutMs: number): Promise<Locator> {
    const shortcut = process.platform === "darwin" ? "Meta+KeyK" : "Control+KeyK";
    await page.keyboard.press(shortcut).catch(() => undefined);

    let input = await this.waitForSearchInput(page, Math.min(timeoutMs, 3_000));
    if (input) return input;

    const triggers = [
      page.getByRole("button", { name: /search/i }).first(),
      page.getByRole("button", { name: /検索/ }).first(),
      page.getByRole("link", { name: /search/i }).first(),
      page.getByRole("link", { name: /検索/ }).first(),
      page.locator('button[aria-label*="Search"]:visible').first(),
      page.locator('button[aria-label*="検索"]:visible').first(),
    ];

    for (const trigger of triggers) {
      try {
        if ((await trigger.count()) === 0 || !(await trigger.isVisible())) continue;
        await trigger.click({ timeout: 2_000 });
        input = await this.waitForSearchInput(page, Math.min(timeoutMs, 3_000));
        if (input) return input;
      } catch {
        // Keep trying resilient search entry points.
      }
    }

    throw new RelayError(
      "SESSION_SEARCH_UNAVAILABLE",
      "Could not open ChatGPT chat-history search. The Web UI may have changed.",
      12,
    );
  }

  private async collectSessionSearchResults(
    page: Page,
    limit: number,
  ): Promise<WebSessionSearchResult[]> {
    const visibleDialog = page.locator('[role="dialog"]:visible').last();
    const hasDialog = (await visibleDialog.count()) > 0 && (await visibleDialog.isVisible()).catch(() => false);
    const scope = hasDialog ? visibleDialog : page.locator("body");
    const links = scope.locator('a[href*="/c/"]:visible');
    const count = Math.min(await links.count(), limit * 3);
    const seen = new Set<string>();
    const results: WebSessionSearchResult[] = [];

    for (let index = 0; index < count && results.length < limit; index += 1) {
      const link = links.nth(index);
      const href = await link.getAttribute("href").catch(() => null);
      if (!href) continue;

      let url: URL;
      try {
        url = new URL(href, this.homeUrl);
      } catch {
        continue;
      }

      if (url.hostname !== "chatgpt.com") continue;
      const match = /\/c\/([^/?#]+)/.exec(url.pathname);
      if (!match || seen.has(match[1])) continue;

      const rawText = await link.innerText().catch(() => "");
      const titleAttribute = (await link.getAttribute("title").catch(() => null)) ?? "";
      const ariaLabel = (await link.getAttribute("aria-label").catch(() => null)) ?? "";
      const title =
        firstNonEmptyLine(rawText) || normalize(titleAttribute) || normalize(ariaLabel) || match[1];

      seen.add(match[1]);
      results.push({
        title,
        conversationId: match[1],
        conversationUrl: url.toString(),
      });
    }

    return results;
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

  async searchSessions(
    page: Page,
    query: string,
    options: { limit?: number; timeoutMs?: number } = {},
  ): Promise<WebSessionSearchResult[]> {
    const cleanQuery = normalize(query);
    if (!cleanQuery) {
      throw new RelayError("EMPTY_SESSION_QUERY", "Session search query cannot be empty.", 2);
    }

    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const timeoutMs = options.timeoutMs ?? 12_000;
    const input = await this.openSessionSearch(page, timeoutMs);
    await input.fill(cleanQuery, { timeout: 5_000 });

    const started = Date.now();
    let best: WebSessionSearchResult[] = [];
    let lastFingerprint = "";
    let stableSince = Date.now();

    while (Date.now() - started < timeoutMs) {
      const current = await this.collectSessionSearchResults(page, limit);
      const fingerprint = current.map((item) => item.conversationId).join("|");

      if (current.length >= best.length) best = current;
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        stableSince = Date.now();
      }

      if (current.length > 0 && Date.now() - stableSince >= 700) return current;
      await sleep(150);
    }

    return best;
  }
}
