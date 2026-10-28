import { describe, expect, it } from "vitest";
import { fold, highlightRanges, searchable, searchTerms, slugify, snippet, toPrefixTsQuery } from "@/lib/utils/text";

describe("fold and slugify", () => {
  it("removes accents and lowercases", () => {
    expect(fold("Inès Œuvre Ébéniste")).toBe("ines oeuvre ebeniste");
  });
  it("builds URL-safe slugs", () => {
    expect(slugify("Développeur full-stack (F/H)")).toBe("developpeur-full-stack-f-h");
    expect(slugify("   ")).toBe("item");
    expect(slugify("a".repeat(100), 10)).toHaveLength(10);
  });
});

describe("search helpers", () => {
  it("splits queries into folded terms, emails included", () => {
    expect(searchTerms("Marion.Lefort@example.com")).toEqual(["marion", "lefort", "example", "com"]);
    expect(searchTerms("  Hélène  ")).toEqual(["helene"]);
  });
  it("produces prefix tsqueries without operators or quotes from the user", () => {
    expect(toPrefixTsQuery("dév front")).toBe("dev:* & front:*");
    // Apostrophes separate words, as in Postgres' own parser.
    expect(toPrefixTsQuery("o'neil")).toBe("o:* & neil:*");
    expect(toPrefixTsQuery("a & b | !c (d)")).toBe("a:* & b:* & c:* & d:*");
    expect(toPrefixTsQuery("   ")).toBeNull();
  });
  it("prepares searchable text", () => {
    expect(searchable("Inès", null, "Notes : très bien !")).toBe("ines notes tres bien");
  });
  it("finds snippets accent-insensitively and keeps the original text", () => {
    const result = snippet("Elle a mené la migration vers Kubernetes chez son employeur précédent.", ["kubernetes"]);
    expect(result).not.toBeNull();
    const [start, end] = result!.highlights[0]!;
    expect(result!.text.slice(start, end)).toBe("Kubernetes");
    expect(snippet("rien à voir", ["kubernetes"])).toBeNull();
  });
  it("merges overlapping highlight ranges", () => {
    expect(highlightRanges("Éléonore", ["ele", "leo"])).toEqual([[0, 4]]);
  });
});
