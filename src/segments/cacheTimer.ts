import { readFile, stat } from "node:fs/promises";
import { debug } from "../utils/logger";
import type { ClaudeHookData } from "../utils/claude";

export interface CacheTimerInfo {
  elapsedSeconds: number;
}

interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  message?: { role?: string; type?: string };
}

export class CacheTimerProvider {
  async getCacheTimerInfo(
    hookData: ClaudeHookData,
  ): Promise<CacheTimerInfo | null> {
    const path = hookData?.transcript_path;
    if (!path) {
      debug("CacheTimer: no transcript_path in hookData");
      return null;
    }

    const anchor =
      (await this.lastUserTimestamp(path)) ?? (await this.fileMtime(path));
    if (anchor === null) return null;

    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - anchor) / 1000),
    );
    return { elapsedSeconds };
  }

  private async lastUserTimestamp(path: string): Promise<number | null> {
    try {
      const content = await readFile(path, "utf-8");
      const lines = content.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]?.trim();
        if (!line) continue;
        try {
          const entry = JSON.parse(line) as TranscriptEntry;
          const messageType =
            entry.type || entry.message?.role || entry.message?.type;
          if (messageType !== "user") continue;
          if (!entry.timestamp) continue;
          const t = Date.parse(entry.timestamp);
          if (Number.isNaN(t)) continue;
          return t;
        } catch {
          continue;
        }
      }
      return null;
    } catch (error) {
      debug(`CacheTimer: readFile failed for ${path}: ${String(error)}`);
      return null;
    }
  }

  private async fileMtime(path: string): Promise<number | null> {
    try {
      const { mtime } = await stat(path);
      return mtime.getTime();
    } catch (error) {
      debug(`CacheTimer: stat failed for ${path}: ${String(error)}`);
      return null;
    }
  }
}
