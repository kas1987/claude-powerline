import {
  shouldShowIcon,
  findSegmentShowIcon,
  resolveIconVisibility,
} from "../src/utils/icon-visibility";
import type { PowerlineConfig } from "../src/config/loader";
import { DEFAULT_CONFIG } from "../src/config/defaults";

describe("shouldShowIcon", () => {
  it("returns true when both are undefined (global default)", () => {
    expect(shouldShowIcon(undefined, undefined)).toBe(true);
  });

  it("per-segment setting overrides global when set to true", () => {
    expect(shouldShowIcon(false, true)).toBe(true);
  });

  it("per-segment setting overrides global when set to false", () => {
    expect(shouldShowIcon(true, false)).toBe(false);
  });

  it("falls back to global when per-segment is undefined", () => {
    expect(shouldShowIcon(false, undefined)).toBe(false);
    expect(shouldShowIcon(true, undefined)).toBe(true);
  });

  it("returns true as global default when per-segment undefined and global undefined", () => {
    expect(shouldShowIcon(undefined, undefined)).toBe(true);
  });
});

describe("findSegmentShowIcon", () => {
  function makeConfig(overrides: Record<string, unknown> = {}): PowerlineConfig {
    return {
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        lines: [
          {
            segments: {
              git: { showIcon: true },
              session: { showIcon: false },
              ...overrides,
            },
          },
        ],
      },
    } as unknown as PowerlineConfig;
  }

  it("returns showIcon value for a configured segment", () => {
    const config = makeConfig();
    expect(findSegmentShowIcon(config, "git")).toBe(true);
    expect(findSegmentShowIcon(config, "session")).toBe(false);
  });

  it("returns undefined for a segment not configured in any line", () => {
    const config = makeConfig();
    expect(findSegmentShowIcon(config, "context")).toBeUndefined();
  });

  it("returns undefined when segment exists but showIcon is not set", () => {
    const config = {
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        lines: [{ segments: { git: {} } }],
      },
    } as unknown as PowerlineConfig;
    expect(findSegmentShowIcon(config, "git")).toBeUndefined();
  });

  it("returns first match across multiple lines", () => {
    const config = {
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        lines: [
          { segments: { git: { showIcon: false } } },
          { segments: { git: { showIcon: true } } },
        ],
      },
    } as unknown as PowerlineConfig;
    expect(findSegmentShowIcon(config, "git")).toBe(false);
  });
});

describe("resolveIconVisibility", () => {
  it("returns true by default (no config overrides)", () => {
    const config = {
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        showIcons: undefined,
        lines: [{ segments: {} }],
      },
    } as unknown as PowerlineConfig;
    expect(resolveIconVisibility(config, "git")).toBe(true);
  });

  it("respects global showIcons=false", () => {
    const config = {
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        showIcons: false,
        lines: [{ segments: {} }],
      },
    } as unknown as PowerlineConfig;
    expect(resolveIconVisibility(config, "git")).toBe(false);
  });

  it("per-segment showIcon overrides global showIcons", () => {
    const config = {
      ...DEFAULT_CONFIG,
      display: {
        ...DEFAULT_CONFIG.display,
        showIcons: false,
        lines: [{ segments: { git: { showIcon: true } } }],
      },
    } as unknown as PowerlineConfig;
    expect(resolveIconVisibility(config, "git")).toBe(true);
  });
});
