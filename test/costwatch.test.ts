import { CostWatchProvider } from "../src/segments/costWatch";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

// Override homedir to point at our temp directory
jest.mock("node:os", () => ({
  ...jest.requireActual("node:os"),
  homedir: jest.fn(),
}));

const mockHomedir = homedir as jest.MockedFunction<typeof homedir>;

describe("CostWatchProvider", () => {
  let tempDir: string;
  let stateDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "costwatch-test-"));
    stateDir = join(tempDir, ".claude", "state");
    require("node:fs").mkdirSync(stateDir, { recursive: true });
    mockHomedir.mockReturnValue(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it("returns null when ccc-cost.json does not exist", async () => {
    const provider = new CostWatchProvider();
    const result = await provider.getCostWatchInfo();
    expect(result).toBeNull();
  });

  it("parses valid ccc-cost.json", async () => {
    const data = {
      cost_total: 12.5,
      sessions: 3,
      asst_turns: 42,
      opus_turn_share: 0.2,
      opus_cost_share: 0.5,
      haiku_share: 0.1,
      alerts: ["Budget alert"],
      level: "warn",
    };
    writeFileSync(join(stateDir, "ccc-cost.json"), JSON.stringify(data));

    const provider = new CostWatchProvider();
    const result = await provider.getCostWatchInfo();

    expect(result).not.toBeNull();
    expect(result!.costTotal).toBe(12.5);
    expect(result!.sessions).toBe(3);
    expect(result!.asstTurns).toBe(42);
    expect(result!.opusTurnShare).toBe(0.2);
    expect(result!.opusCostShare).toBe(0.5);
    expect(result!.haikuShare).toBe(0.1);
    expect(result!.alerts).toEqual(["Budget alert"]);
    expect(result!.level).toBe("warn");
  });

  it("returns level=ok when level field is missing", async () => {
    writeFileSync(join(stateDir, "ccc-cost.json"), JSON.stringify({ cost_total: 5 }));

    const provider = new CostWatchProvider();
    const result = await provider.getCostWatchInfo();

    expect(result).not.toBeNull();
    expect(result!.level).toBe("ok");
  });

  it("rejects unknown level values and defaults to ok", async () => {
    writeFileSync(
      join(stateDir, "ccc-cost.json"),
      JSON.stringify({ cost_total: 5, level: "critical" }),
    );

    const provider = new CostWatchProvider();
    const result = await provider.getCostWatchInfo();

    expect(result!.level).toBe("ok");
  });

  it("filters non-string values from alerts array", async () => {
    writeFileSync(
      join(stateDir, "ccc-cost.json"),
      JSON.stringify({ cost_total: 5, alerts: ["valid", 123, null, "also valid"] }),
    );

    const provider = new CostWatchProvider();
    const result = await provider.getCostWatchInfo();

    expect(result!.alerts).toEqual(["valid", "also valid"]);
  });

  it("returns empty alerts array when alerts field is missing", async () => {
    writeFileSync(join(stateDir, "ccc-cost.json"), JSON.stringify({ cost_total: 5 }));

    const provider = new CostWatchProvider();
    const result = await provider.getCostWatchInfo();

    expect(result!.alerts).toEqual([]);
  });

  it("defaults numeric fields to 0 when missing", async () => {
    writeFileSync(join(stateDir, "ccc-cost.json"), JSON.stringify({ level: "ok" }));

    const provider = new CostWatchProvider();
    const result = await provider.getCostWatchInfo();

    expect(result!.costTotal).toBe(0);
    expect(result!.sessions).toBe(0);
    expect(result!.asstTurns).toBe(0);
    expect(result!.opusTurnShare).toBe(0);
    expect(result!.opusCostShare).toBe(0);
    expect(result!.haikuShare).toBe(0);
  });

  it("returns null when file contains invalid JSON", async () => {
    writeFileSync(join(stateDir, "ccc-cost.json"), "not json{{");

    const provider = new CostWatchProvider();
    const result = await provider.getCostWatchInfo();

    expect(result).toBeNull();
  });

  it("accepts alert level", async () => {
    writeFileSync(
      join(stateDir, "ccc-cost.json"),
      JSON.stringify({ cost_total: 100, level: "alert" }),
    );

    const provider = new CostWatchProvider();
    const result = await provider.getCostWatchInfo();

    expect(result!.level).toBe("alert");
  });
});
