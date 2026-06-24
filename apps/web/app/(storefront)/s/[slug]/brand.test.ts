import { describe, it, expect } from "vitest";
import { brandToCssVars } from "./brand";

describe("brandToCssVars", () => {
  it("maps known brand tokens to CSS variables", () => {
    const vars = brandToCssVars({
      primary: "#ff0000",
      accent: "#00ff00",
      background: "#000000",
      surface: "#111111",
      displayFont: "Inter, sans-serif",
      monoFont: "Fira Code, monospace",
    });

    expect(vars["--color-primary-fixed"]).toBe("#ff0000");
    expect(vars["--color-secondary"]).toBe("#00ff00");
    expect(vars["--color-background"]).toBe("#000000");
    expect(vars["--color-surface"]).toBe("#111111");
    expect(vars["--font-display"]).toBe("Inter, sans-serif");
    expect(vars["--font-mono"]).toBe("Fira Code, monospace");
  });

  it("ignores unknown keys and non-string values", () => {
    const vars = brandToCssVars({
      primary: "#ff0000",
      unknown: "#fff",
      background: 123,
      surface: null,
    } as Record<string, unknown>);

    expect(vars["--color-primary-fixed"]).toBe("#ff0000");
    expect(vars["--color-background"]).toBeUndefined();
    expect(vars["--unknown"]).toBeUndefined();
  });

  it("returns an empty object for null/undefined brand", () => {
    expect(brandToCssVars(null)).toEqual({});
    expect(brandToCssVars(undefined as unknown as null)).toEqual({});
  });

  it("ignores studio metadata such as name", () => {
    const vars = brandToCssVars({ name: "Gridlock Games", primary: "#c3f400" });
    expect(vars["--color-primary-fixed"]).toBe("#c3f400");
    expect(vars.name).toBeUndefined();
  });
});
