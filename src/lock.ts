import path from "node:path";
import { open, readFile, unlink } from "node:fs/promises";
import { RelayError } from "./errors.js";
import { ensureDataDirs, locksDir } from "./paths.js";

interface LockData {
  pid: number;
  createdAt: string;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM still means a process exists; we just do not have permission to signal it.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function clearStaleLock(file: string): Promise<boolean> {
  try {
    const raw = await readFile(file, "utf8");
    const data = JSON.parse(raw) as LockData;
    if (!Number.isInteger(data.pid) || data.pid <= 0 || !isProcessAlive(data.pid)) {
      await unlink(file).catch(() => undefined);
      return true;
    }
  } catch {
    await unlink(file).catch(() => undefined);
    return true;
  }
  return false;
}

export async function acquireLock(
  name: string,
  timeoutMs = 60_000,
): Promise<() => Promise<void>> {
  await ensureDataDirs();
  const file = path.join(locksDir(), `${safeName(name)}.lock`);
  const started = Date.now();

  while (true) {
    try {
      const handle = await open(file, "wx", 0o600);
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
        "utf8",
      );

      return async () => {
        await handle.close().catch(() => undefined);
        await unlink(file).catch(() => undefined);
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      if (await clearStaleLock(file)) continue;
      if (Date.now() - started >= timeoutMs) {
        throw new RelayError(
          "PROFILE_BUSY",
          `Timed out waiting for lock: ${name}`,
          20,
          { lock: name, timeoutMs },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
