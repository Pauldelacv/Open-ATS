import { describe, expect, it } from "vitest";
import { brandPalette, contrast } from "@/lib/brand";

describe("brand palette", () => {
  it.each(["#2447D6", "#FFE45C", "#1F5E4B", "#F2F2F2", "#000000", "#E11D48", "#7DD3FC"])(
    "keeps buttons and links readable for %s",
    (color) => {
      const palette = brandPalette(color);
      expect(contrast(palette.brand, palette.brandFg)).toBeGreaterThanOrEqual(3);
      expect(contrast(palette.brandLink, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    },
  );
  it("uses dark text on light brand colours", () => {
    expect(brandPalette("#FFE45C").brandFg).toBe("#18233A");
    expect(brandPalette("#2447D6").brandFg).toBe("#FFFFFF");
  });
  it("falls back to cobalt for invalid input", () => {
    expect(brandPalette("not-a-colour").brand).toBe("#2447d6");
  });
});
