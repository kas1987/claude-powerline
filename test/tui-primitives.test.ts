import {
  colorize,
  padRight,
  padLeft,
  padCenter,
  truncateAnsi,
  contentRow,
  divider,
  bottomBorder,
  spreadEven,
  spreadTwo,
} from "../src/tui/primitives";
import type { BoxChars } from "../src/tui/types";

const BOX: BoxChars = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  teeLeft: "├",
  teeRight: "┤",
};

describe("colorize", () => {
  it("returns plain text when no color and no bold", () => {
    expect(colorize("hello", "", "", false)).toBe("hello");
  });

  it("wraps text with fg color and reset", () => {
    expect(colorize("hi", "\x1b[31m", "\x1b[0m")).toBe("\x1b[31mhi\x1b[0m");
  });

  it("adds bold codes when bold=true and reset is non-empty", () => {
    const result = colorize("hi", "\x1b[31m", "\x1b[0m", true);
    expect(result).toBe("\x1b[31m\x1b[1mhi\x1b[22m\x1b[0m");
  });

  it("skips bold when reset is empty string", () => {
    const result = colorize("hi", "\x1b[31m", "", true);
    expect(result).toBe("\x1b[31mhi");
  });

  it("applies color without bold when bold=false", () => {
    const result = colorize("hi", "\x1b[32m", "\x1b[0m", false);
    expect(result).toBe("\x1b[32mhi\x1b[0m");
  });
});

describe("padRight", () => {
  it("pads short text to desired width", () => {
    expect(padRight("hi", 5)).toBe("hi   ");
  });

  it("returns text unchanged when already at width", () => {
    expect(padRight("hello", 5)).toBe("hello");
  });

  it("returns text unchanged when wider than target", () => {
    expect(padRight("toolong", 4)).toBe("toolong");
  });

  it("pads ANSI-colored text using visible length", () => {
    const colored = "\x1b[31mhi\x1b[0m";
    const result = padRight(colored, 5);
    expect(result).toBe(colored + "   ");
  });
});

describe("padLeft", () => {
  it("pads short text with leading spaces", () => {
    expect(padLeft("hi", 5)).toBe("   hi");
  });

  it("returns text unchanged when already at width", () => {
    expect(padLeft("hello", 5)).toBe("hello");
  });

  it("returns text unchanged when wider than target", () => {
    expect(padLeft("toolong", 4)).toBe("toolong");
  });
});

describe("padCenter", () => {
  it("centers text with even total padding", () => {
    expect(padCenter("hi", 6)).toBe("  hi  ");
  });

  it("puts extra space on the right for odd total padding", () => {
    expect(padCenter("hi", 5)).toBe(" hi  ");
  });

  it("returns text unchanged when already at width", () => {
    expect(padCenter("hello", 5)).toBe("hello");
  });

  it("returns text unchanged when wider than target", () => {
    expect(padCenter("toolong", 4)).toBe("toolong");
  });
});

describe("truncateAnsi", () => {
  it("returns text unchanged when within maxWidth", () => {
    expect(truncateAnsi("hello", 10)).toBe("hello");
  });

  it("truncates and appends ellipsis when too long", () => {
    const result = truncateAnsi("hello world", 6);
    expect(result).toContain("…");
    expect(result.replace(/\x1b\[[0-9;]*m/g, "")).toHaveLength(6);
  });

  it("preserves ANSI escape codes in result", () => {
    const colored = "\x1b[31mhello world\x1b[0m";
    const result = truncateAnsi(colored, 6);
    expect(result).toContain("\x1b[31m");
  });

  it("handles text with only ANSI codes and short visible content", () => {
    const colored = "\x1b[31mhi\x1b[0m";
    const result = truncateAnsi(colored, 10);
    expect(result).toBe(colored);
  });
});

describe("contentRow", () => {
  it("renders a row with border and padded content", () => {
    const row = contentRow(BOX, "test", 10);
    expect(row).toContain("│");
    expect(row).toContain("test");
    expect(row.startsWith("│")).toBe(true);
    expect(row.endsWith("│")).toBe(true);
  });

  it("pads content to fill inner width", () => {
    const row = contentRow(BOX, "hi", 10);
    // innerWidth=10, content area = 10-2=8, so "hi" + 6 spaces
    expect(row).toBe("│ hi       │");
  });
});

describe("divider", () => {
  it("renders a divider line with tee characters", () => {
    const line = divider(BOX, 5);
    expect(line).toBe("├─────┤");
  });

  it("renders a divider with zero width", () => {
    const line = divider(BOX, 0);
    expect(line).toBe("├┤");
  });
});

describe("bottomBorder", () => {
  it("renders simple border with no text", () => {
    const line = bottomBorder(BOX, 5);
    expect(line).toBe("└─────┘");
  });

  it("renders border with left text", () => {
    const line = bottomBorder(BOX, 10, "L");
    expect(line).toContain("└");
    expect(line).toContain("L");
    expect(line).toContain("┘");
  });

  it("renders border with right text", () => {
    const line = bottomBorder(BOX, 10, undefined, "R");
    expect(line).toContain("└");
    expect(line).toContain("R");
    expect(line).toContain("┘");
  });

  it("renders border with both left and right text", () => {
    const line = bottomBorder(BOX, 20, "LEFT", "RIGHT");
    expect(line).toContain("LEFT");
    expect(line).toContain("RIGHT");
  });

  it("truncates text when combined text exceeds innerWidth", () => {
    const line = bottomBorder(BOX, 10, "LONGERLEFT", "LONGERRIGHT");
    expect(line.startsWith("└")).toBe(true);
    expect(line.endsWith("┘")).toBe(true);
  });
});

describe("spreadEven", () => {
  it("returns empty string for empty parts array", () => {
    expect(spreadEven([], 80)).toBe("");
  });

  it("returns single part unchanged", () => {
    expect(spreadEven(["hello"], 80)).toBe("hello");
  });

  it("spreads two parts with gap between them", () => {
    const result = spreadEven(["A", "B"], 10);
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result.indexOf("A")).toBeLessThan(result.indexOf("B"));
    expect(result.indexOf("B") - result.indexOf("A")).toBeGreaterThanOrEqual(2);
  });

  it("spreads three parts with gaps between them", () => {
    const result = spreadEven(["A", "B", "C"], 20);
    expect(result.indexOf("A")).toBeLessThan(result.indexOf("B"));
    expect(result.indexOf("B")).toBeLessThan(result.indexOf("C"));
  });
});

describe("spreadTwo", () => {
  it("returns left when right is empty", () => {
    expect(spreadTwo("left", "", 80)).toBe("left");
  });

  it("returns right when left is empty", () => {
    expect(spreadTwo("", "right", 80)).toBe("right");
  });

  it("spreads left and right with space between", () => {
    const result = spreadTwo("LEFT", "RIGHT", 20);
    expect(result).toContain("LEFT");
    expect(result).toContain("RIGHT");
    expect(result.indexOf("LEFT")).toBeLessThan(result.indexOf("RIGHT"));
  });

  it("uses minimum 2 spaces when gap is too small", () => {
    const result = spreadTwo("LEFTLONG", "RIGHTLONG", 5);
    expect(result).toBe("LEFTLONG  RIGHTLONG");
  });

  it("fills exactly the total width", () => {
    const result = spreadTwo("A", "B", 10);
    expect(result.length).toBe(10);
  });
});
