import type { ClaudeHookData } from "../utils/claude";
import { debug } from "../utils/logger";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface OverheadInfo {
  totalTokens: number;
  baselineTokens: number;
  gapTokens: number;
  gapPct: number;
  pctOfWindow: number;
  t1: number;
  t2: number;
  t3: number;
  skillCount: number;
  agentCount: number;
  dynamicLoad: number;
  level: "ok" | "warn" | "alert";
}

export class OverheadProvider {
  async getOverheadInfo(
    _hookData?: ClaudeHookData,
  ): Promise<OverheadInfo | null> {
    try {
      const baselinePath = path.join(
        os.homedir(),
        ".claude",
        "state",
        "actual-baseline.json",
      );
      const bootPath = path.join(
        os.homedir(),
        ".claude",
        "state",
        "boot-context.json",
      );

      let baselineData: Record<string, unknown> = {};
      let bootData: Record<string, unknown> = {};

      try {
        const raw = await readFile(baselinePath, "utf-8");
        baselineData = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        debug("OverheadProvider: actual-baseline.json not found");
      }

      try {
        const raw = await readFile(bootPath, "utf-8");
        bootData = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        debug("OverheadProvider: boot-context.json not found");
      }

      const total =
        typeof baselineData.boot_total === "number"
          ? baselineData.boot_total
          : typeof bootData.total === "number"
            ? bootData.total
            : 0;

      if (!total) return null;

      const baseline =
        typeof baselineData.actual_baseline_est === "number"
          ? baselineData.actual_baseline_est
          : 0;

      const gap =
        typeof baselineData.gap_tokens === "number"
          ? baselineData.gap_tokens
          : 0;

      const gapPct =
        typeof baselineData.gap_pct_of_baseline === "number"
          ? baselineData.gap_pct_of_baseline
          : 0;

      const pctOfWindow =
        typeof baselineData.pct_of_200k_window === "number"
          ? baselineData.pct_of_200k_window
          : 0;

      const levelRaw = baselineData.level;
      const level =
        levelRaw === "ok" || levelRaw === "warn" || levelRaw === "alert"
          ? levelRaw
          : "ok";

      return {
        totalTokens: total,
        baselineTokens: baseline,
        gapTokens: gap,
        gapPct,
        pctOfWindow,
        t1: typeof baselineData.boot_t1 === "number" ? baselineData.boot_t1 : 0,
        t2: typeof baselineData.boot_t2 === "number" ? baselineData.boot_t2 : 0,
        t3: typeof baselineData.boot_t3 === "number" ? baselineData.boot_t3 : 0,
        skillCount:
          typeof baselineData.skill_count === "number"
            ? baselineData.skill_count
            : 0,
        agentCount:
          typeof baselineData.agent_count === "number"
            ? baselineData.agent_count
            : 0,
        dynamicLoad:
          typeof baselineData.boot_dynamic_load === "number"
            ? baselineData.boot_dynamic_load
            : typeof bootData.dynamic_load === "number"
              ? bootData.dynamic_load
              : 0,
        level,
      };
    } catch (error) {
      debug("OverheadProvider error:", error);
      return null;
    }
  }
}
