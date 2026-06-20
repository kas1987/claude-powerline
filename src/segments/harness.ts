import type { ClaudeHookData } from "../utils/claude";
import { debug } from "../utils/logger";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface HarnessInfo {
  tier: string;
  promptHash: string;
  callType: string;
}

export class HarnessProvider {
  async getHarnessInfo(
    _hookData?: ClaudeHookData,
  ): Promise<HarnessInfo | null> {
    try {
      const statePath = path.join(
        os.homedir(),
        ".claude",
        "state",
        "harness-route.json",
      );

      let data: Record<string, unknown> = {};
      try {
        const raw = await readFile(statePath, "utf-8");
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        debug("HarnessProvider: harness-route.json not found");
        return null;
      }

      const tier = typeof data.tier === "string" ? data.tier : "";
      if (!tier) return null;

      const promptHash =
        typeof data.prompt_hash === "string" ? data.prompt_hash : "";
      const callType = typeof data.call_type === "string" ? data.call_type : "";

      return { tier, promptHash, callType };
    } catch (error) {
      debug("HarnessProvider error:", error);
      return null;
    }
  }
}
