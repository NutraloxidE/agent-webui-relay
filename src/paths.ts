import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export function dataRoot(): string {
  const override = process.env.AGENT_WEBUI_RELAY_HOME;
  if (override) return path.resolve(override);

  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
      "agent-webui-relay",
    );
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "agent-webui-relay");
  }

  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "agent-webui-relay",
  );
}

export function profileDir(profileId: string): string {
  return path.join(dataRoot(), "profiles", profileId, "chromium");
}

export function statePath(): string {
  return path.join(dataRoot(), "state.json");
}

export function locksDir(): string {
  return path.join(dataRoot(), "locks");
}

export async function ensureDataDirs(): Promise<void> {
  await mkdir(dataRoot(), { recursive: true, mode: 0o700 });
  await mkdir(path.join(dataRoot(), "profiles"), { recursive: true, mode: 0o700 });
  await mkdir(locksDir(), { recursive: true, mode: 0o700 });
}
