import type { Page } from "playwright";
import type { ConversationReference, WebSessionSearchResult } from "../types.js";

export interface CommitResult {
  confirmedBy: "user_message" | "composer_cleared";
}

export interface AIWebProvider {
  readonly name: string;
  readonly homeUrl: string;

  open(page: Page, conversationUrl?: string): Promise<void>;
  ensureReady(page: Page, timeoutMs?: number): Promise<boolean>;
  prepareSubmission(page: Page, text: string, timeoutMs?: number): Promise<void>;
  commitSubmission(page: Page, text: string, timeoutMs?: number): Promise<CommitResult>;
  conversationReference(page: Page): Promise<ConversationReference>;
  searchSessions(
    page: Page,
    query: string,
    options?: { limit?: number; timeoutMs?: number },
  ): Promise<WebSessionSearchResult[]>;
}
