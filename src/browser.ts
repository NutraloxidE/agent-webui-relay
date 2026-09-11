import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { profileDir } from "./paths.js";

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
}

export async function openBrowser(
  profileId: string,
  headless: boolean,
): Promise<BrowserSession> {
  const dir = profileDir(profileId);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const context = await chromium.launchPersistentContext(dir, {
    headless,
    viewport: { width: 1365, height: 900 },
  });

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}
