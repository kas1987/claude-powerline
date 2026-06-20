import type { ClaudeHookData } from "../utils/claude";
import { debug } from "../utils/logger";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface CostWatchInfo {
  costTotal: number;
  sessions: number;
  asstTurns: number;
  opusTurnShare: number;
  opusCostShare: number;
  haikuShare: number;
  alerts: string[];
  level: "ok" | "warn" | "alert";
}

export class CostWatchProvider {
  async getCostWatchInfo(
    _hookData?: ClaudeHookData,
  ): Promise<CostWatchInfo | null> {
    try {
      const statePath = path.join(
        os.homedir(),
        ".claude",
        "state",
        "ccc-cost.json",
      );

      let data: Record<string, unknown> = {};
      try {
        const raw = await readFile(statePath, "utf-8");
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        debug("CostWatchProvider: ccc-cost.json not found");
        return null;
      }

      const levelRaw = data.level;
      const level =
        levelRaw === "ok" || levelRaw === "warn" || levelRaw === "alert"
          ? levelRaw
          : "ok";

      const alerts = Array.isArray(data.alerts)
        ? data.alerts.filter((a): a is string => typeof a === "string")
        : [];

      return {
        costTotal: typeof data.cost_total === "number" ? data.cost_total : 0,
        sessions: typeof data.sessions === "number" ? data.sessions : 0,
        asstTurns: typeof data.asst_turns === "number" ? data.asst_turns : 0,
        opusTurnShare:
          typeof data.opus_turn_share === "number" ? data.opus_turn_share : 0,
        opusCostShare:
          typeof data.opus_cost_share === "number" ? data.opus_cost_share : 0,
        haikuShare: typeof data.haiku_share === "number" ? data.haiku_share : 0,
        alerts,
        level,
      };
    } catch (error) {
      debug("CostWatchProvider error:", error);
      return null;
    }
  }
}
