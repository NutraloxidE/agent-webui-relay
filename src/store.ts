import { rename, readFile, writeFile } from "node:fs/promises";
import { acquireLock } from "./lock.js";
import { ensureDataDirs, statePath } from "./paths.js";
import type { RelayState } from "./types.js";

function emptyState(): RelayState {
  return {
    version: 1,
    conversations: {},
    submissions: {},
    idempotency: {},
  };
}

export async function loadState(): Promise<RelayState> {
  await ensureDataDirs();
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as RelayState;
    if (parsed.version !== 1) throw new Error(`Unsupported state version: ${parsed.version}`);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

async function writeState(state: RelayState): Promise<void> {
  await ensureDataDirs();
  const destination = statePath();
  const temp = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, destination);
}

export async function updateState<T>(
  mutator: (state: RelayState) => T | Promise<T>,
): Promise<T> {
  const release = await acquireLock("state", 10_000);
  try {
    const state = await loadState();
    const result = await mutator(state);
    await writeState(state);
    return result;
  } finally {
    await release();
  }
}
