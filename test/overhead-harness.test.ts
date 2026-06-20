import { OverheadProvider } from "../src/segments/overhead";
import { HarnessProvider } from "../src/segments/harness";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

jest.mock("node:os", () => ({
  ...jest.requireActual("node:os"),
  homedir: jest.fn(),
}));

const mockHomedir = homedir as jest.MockedFunction<typeof homedir>;

describe("OverheadProvider", () => {
  let tempDir: string;
  let stateDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "overhead-test-"));
    stateDir = join(tempDir, ".claude", "state");
    mkdirSync(stateDir, { recursive: true });
    mockHomedir.mockReturnValue(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it("returns null when neither state file exists", async () => {
    const result = await new OverheadProvider().getOverheadInfo();
    expect(result).toBeNull();
  });

  it("returns null when total is zero", async () => {
    writeFileSync(
      join(stateDir, "actual-baseline.json"),
      JSON.stringify({ boot_total: 0 }),
    );
    const result = await new OverheadProvider().getOverheadInfo();
    expect(result).toBeNull();
  });

  it("parses full actual-baseline.json correctly", async () => {
    const data = {
      boot_total: 50000,
      actual_baseline_est: 30000,
      gap_tokens: 20000,
      gap_pct_of_baseline: 66.7,
      pct_of_200k_window: 25.0,
      boot_t1: 10000,
      boot_t2: 15000,
      boot_t3: 25000,
      skill_count: 3,
      agent_count: 1,
      boot_dynamic_load: 5000,
      level: "warn",
    };
    writeFileSync(join(stateDir, "actual-baseline.json"), JSON.stringify(data));

    const result = await new OverheadProvider().getOverheadInfo();

    expect(result).not.toBeNull();
    expect(result!.totalTokens).toBe(50000);
    expect(result!.baselineTokens).toBe(30000);
    expect(result!.gapTokens).toBe(20000);
    expect(result!.gapPct).toBe(66.7);
    expect(result!.pctOfWindow).toBe(25.0);
    expect(result!.t1).toBe(10000);
    expect(result!.t2).toBe(15000);
    expect(result!.t3).toBe(25000);
    expect(result!.skillCount).toBe(3);
    expect(result!.agentCount).toBe(1);
    expect(result!.dynamicLoad).toBe(5000);
    expect(result!.level).toBe("warn");
  });

  it("falls back to boot-context.json for total when baseline missing boot_total", async () => {
    writeFileSync(
      join(stateDir, "actual-baseline.json"),
      JSON.stringify({ actual_baseline_est: 30000 }),
    );
    writeFileSync(
      join(stateDir, "boot-context.json"),
      JSON.stringify({ total: 40000, dynamic_load: 2000 }),
    );

    const result = await new OverheadProvider().getOverheadInfo();
    expect(result!.totalTokens).toBe(40000);
    expect(result!.dynamicLoad).toBe(2000);
  });

  it("defaults level to ok for unknown level values", async () => {
    writeFileSync(
      join(stateDir, "actual-baseline.json"),
      JSON.stringify({ boot_total: 10000, level: "critical" }),
    );

    const result = await new OverheadProvider().getOverheadInfo();
    expect(result!.level).toBe("ok");
  });

  it("defaults numeric fields to 0 when missing", async () => {
    writeFileSync(
      join(stateDir, "actual-baseline.json"),
      JSON.stringify({ boot_total: 10000 }),
    );

    const result = await new OverheadProvider().getOverheadInfo();
    expect(result!.baselineTokens).toBe(0);
    expect(result!.gapTokens).toBe(0);
    expect(result!.gapPct).toBe(0);
    expect(result!.t1).toBe(0);
    expect(result!.skillCount).toBe(0);
    expect(result!.agentCount).toBe(0);
  });

  it("accepts alert level", async () => {
    writeFileSync(
      join(stateDir, "actual-baseline.json"),
      JSON.stringify({ boot_total: 10000, level: "alert" }),
    );

    const result = await new OverheadProvider().getOverheadInfo();
    expect(result!.level).toBe("alert");
  });
});

describe("HarnessProvider", () => {
  let tempDir: string;
  let stateDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "harness-test-"));
    stateDir = join(tempDir, ".claude", "state");
    mkdirSync(stateDir, { recursive: true });
    mockHomedir.mockReturnValue(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it("returns null when harness-route.json does not exist", async () => {
    const result = await new HarnessProvider().getHarnessInfo();
    expect(result).toBeNull();
  });

  it("returns null when tier field is missing or empty", async () => {
    writeFileSync(
      join(stateDir, "harness-route.json"),
      JSON.stringify({ prompt_hash: "abc", call_type: "direct" }),
    );
    const result = await new HarnessProvider().getHarnessInfo();
    expect(result).toBeNull();
  });

  it("parses valid harness-route.json", async () => {
    writeFileSync(
      join(stateDir, "harness-route.json"),
      JSON.stringify({ tier: "pro", prompt_hash: "deadbeef", call_type: "agent" }),
    );

    const result = await new HarnessProvider().getHarnessInfo();

    expect(result).not.toBeNull();
    expect(result!.tier).toBe("pro");
    expect(result!.promptHash).toBe("deadbeef");
    expect(result!.callType).toBe("agent");
  });

  it("defaults promptHash and callType to empty string when missing", async () => {
    writeFileSync(
      join(stateDir, "harness-route.json"),
      JSON.stringify({ tier: "free" }),
    );

    const result = await new HarnessProvider().getHarnessInfo();

    expect(result!.tier).toBe("free");
    expect(result!.promptHash).toBe("");
    expect(result!.callType).toBe("");
  });

  it("returns null when file contains invalid JSON", async () => {
    writeFileSync(join(stateDir, "harness-route.json"), "invalid json{{");

    const result = await new HarnessProvider().getHarnessInfo();
    expect(result).toBeNull();
  });
});
