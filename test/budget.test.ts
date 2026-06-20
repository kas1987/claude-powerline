import {
  calculateBudgetPercentage,
  getBudgetStatus,
  pickBudgetValue,
  resolveBudgetDisplay,
} from "../src/utils/budget";

describe("calculateBudgetPercentage", () => {
  it("returns correct percentage", () => {
    expect(calculateBudgetPercentage(50, 100)).toBe(50);
    expect(calculateBudgetPercentage(0, 100)).toBe(0);
    expect(calculateBudgetPercentage(100, 100)).toBe(100);
  });

  it("caps at 100 when cost exceeds budget", () => {
    expect(calculateBudgetPercentage(150, 100)).toBe(100);
    expect(calculateBudgetPercentage(1000, 100)).toBe(100);
  });

  it("returns null when budget is undefined", () => {
    expect(calculateBudgetPercentage(50, undefined)).toBeNull();
  });

  it("returns null when budget is zero or negative", () => {
    expect(calculateBudgetPercentage(50, 0)).toBeNull();
    expect(calculateBudgetPercentage(50, -10)).toBeNull();
  });

  it("returns null when cost is negative", () => {
    expect(calculateBudgetPercentage(-1, 100)).toBeNull();
  });
});

describe("getBudgetStatus", () => {
  it("returns empty status when no budget", () => {
    const status = getBudgetStatus(50, undefined);
    expect(status.percentage).toBeNull();
    expect(status.isWarning).toBe(false);
    expect(status.displayText).toBe("");
  });

  it("shows low usage display (under 50%)", () => {
    const status = getBudgetStatus(30, 100);
    expect(status.percentage).toBe(30);
    expect(status.isWarning).toBe(false);
    expect(status.displayText).toBe(" 30%");
  });

  it("shows medium usage display (50-79%)", () => {
    const status = getBudgetStatus(60, 100);
    expect(status.percentage).toBe(60);
    expect(status.isWarning).toBe(false);
    expect(status.displayText).toBe(" +60%");
  });

  it("shows warning display at default threshold (80%)", () => {
    const status = getBudgetStatus(80, 100);
    expect(status.percentage).toBe(80);
    expect(status.isWarning).toBe(true);
    expect(status.displayText).toBe(" !80%");
  });

  it("respects custom warning threshold", () => {
    const status50 = getBudgetStatus(50, 100, 50);
    expect(status50.isWarning).toBe(true);
    expect(status50.displayText).toBe(" !50%");

    const statusBelow = getBudgetStatus(49, 100, 50);
    expect(statusBelow.isWarning).toBe(false);
  });

  it("shows 100% when cost equals budget", () => {
    const status = getBudgetStatus(100, 100);
    expect(status.percentage).toBe(100);
    expect(status.isWarning).toBe(true);
    expect(status.displayText).toBe(" !100%");
  });
});

describe("pickBudgetValue", () => {
  it("returns cost when budget type is cost", () => {
    expect(pickBudgetValue(5.0, 1000, "cost")).toBe(5.0);
  });

  it("returns tokens when budget type is tokens", () => {
    expect(pickBudgetValue(5.0, 1000, "tokens")).toBe(1000);
  });

  it("returns cost when budget type is undefined", () => {
    expect(pickBudgetValue(5.0, 1000, undefined)).toBe(5.0);
  });

  it("returns null cost when cost is null and type is not tokens", () => {
    expect(pickBudgetValue(null, 1000, undefined)).toBeNull();
  });

  it("returns null when tokens is null and type is tokens", () => {
    expect(pickBudgetValue(5.0, null, "tokens")).toBeNull();
  });
});

describe("resolveBudgetDisplay", () => {
  it("returns showBase=true and no percentText when no budget configured", () => {
    const state = resolveBudgetDisplay(5.0, 1000);
    expect(state.suppressAll).toBe(false);
    expect(state.showBase).toBe(true);
    expect(state.percentText).toBe("");
    expect(state.percentageOnly).toBe(false);
  });

  it("returns default state when budget amount is zero", () => {
    const state = resolveBudgetDisplay(5.0, 1000, { amount: 0 });
    expect(state.showBase).toBe(true);
    expect(state.percentText).toBe("");
  });

  it("returns default state when budget value is null", () => {
    const state = resolveBudgetDisplay(null, null, { amount: 100 });
    expect(state.showBase).toBe(true);
    expect(state.percentText).toBe("");
  });

  it("suppresses all when both showValue and showPercentage are false", () => {
    const state = resolveBudgetDisplay(50, 1000, {
      amount: 100,
      showValue: false,
      showPercentage: false,
    });
    expect(state.suppressAll).toBe(true);
    expect(state.showBase).toBe(false);
  });

  it("shows percentage only when showValue is false", () => {
    const state = resolveBudgetDisplay(50, 1000, {
      amount: 100,
      showValue: false,
      showPercentage: true,
    });
    expect(state.percentageOnly).toBe(true);
    expect(state.showBase).toBe(false);
    expect(state.percentText).toBe("+50%");
  });

  it("shows base without percentage when showPercentage is false", () => {
    const state = resolveBudgetDisplay(50, 1000, {
      amount: 100,
      showValue: true,
      showPercentage: false,
    });
    expect(state.showBase).toBe(true);
    expect(state.percentText).toBe("");
    expect(state.percentageOnly).toBe(false);
  });

  it("uses token budget type when specified", () => {
    const state = resolveBudgetDisplay(5.0, 500, {
      amount: 1000,
      type: "tokens",
      showValue: true,
      showPercentage: true,
    });
    expect(state.showBase).toBe(true);
    expect(state.percentText).toBe("+50%");
  });

  it("uses warningThreshold from budget config", () => {
    const warnState = resolveBudgetDisplay(60, 1000, {
      amount: 100,
      warningThreshold: 50,
      showValue: true,
      showPercentage: true,
    });
    expect(warnState.percentText).toBe("!60%");

    const okState = resolveBudgetDisplay(40, 1000, {
      amount: 100,
      warningThreshold: 50,
      showValue: true,
      showPercentage: true,
    });
    expect(okState.percentText).toBe("40%");
  });
});
