import { debug } from "../utils/logger";
import { minutesUntilReset } from "../utils/formatters";
import type { ClaudeHookData } from "../utils/claude";

export interface BlockInfo {
  nativeUtilization: number;
  timeRemaining: number;
}

export class BlockProvider {
  async getActiveBlockInfo(
    hookData?: ClaudeHookData,
  ): Promise<BlockInfo | null> {
    // ── 1. Native Claude rate_limits (preferred) ────────────────────────
    const fiveHour = hookData?.rate_limits?.five_hour;
    if (fiveHour) {
      const timeRemaining = minutesUntilReset(fiveHour.resets_at);
      debug(
        `Block segment: Using native rate_limits: ${fiveHour.used_percentage}%, resets in ${timeRemaining}m`,
      );
      return {
        nativeUtilization: fiveHour.used_percentage,
        timeRemaining,
      };
    }

    // ── 2. Fallback: compute from context_window usage ──────────────────
    // Useful for Ollama, Pi, or when Claude stops sending rate_limits.
    const ctx = hookData?.context_window;
    if (ctx && ctx.context_window_size > 0) {
      const totalTokens =
        (ctx.total_input_tokens || 0) +
        (ctx.total_output_tokens || 0);

      const usedPct =
        ctx.used_percentage ??
        Math.min(100, Math.round((totalTokens / ctx.context_window_size) * 100));

      // Estimate time-to-limit from session burn rate.
      // Burn rate = tokens consumed / session duration.
      const durationMs = hookData?.cost?.total_duration_ms ?? 0;
      const durationMin = durationMs / 60000;

      let timeRemaining = 0;
      if (durationMin > 0.5 && totalTokens > 0) {
        const tokensPerMin = totalTokens / durationMin;
        const remainingTokens = Math.max(0, ctx.context_window_size - totalTokens);
        timeRemaining = Math.round(remainingTokens / tokensPerMin);
      } else {
        // Not enough history; show remaining capacity as a large number
        timeRemaining = Math.round((ctx.context_window_size - totalTokens) / 100);
      }

      debug(
        `Block segment: Fallback from context_window: ${usedPct}%, ~${timeRemaining}m remaining`,
      );
      return {
        nativeUtilization: usedPct,
        timeRemaining,
      };
    }

    debug("Block segment: No rate_limits or context_window data available");
    return null;
  }
}
