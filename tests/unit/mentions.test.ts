import { describe, expect, it } from "vitest";
import { encodeMentions, mentionedIds, noteSegments, plainNote } from "@/lib/mentions";

describe("mentions", () => {
  const team = [
    { id: "u1", name: "Claire Dubois" },
    { id: "u2", name: "Claire" },
  ];
  it("encodes picked names, longest first", () => {
    const body = encodeMentions("@Claire Dubois et @Claire, avis ?", team);
    expect(body).toBe("<@u1> et <@u2>, avis ?");
    expect(mentionedIds(body)).toEqual(["u1", "u2"]);
  });
  it("splits a note into text and mention segments", () => {
    expect(noteSegments("Voir <@u1> demain")).toEqual([
      { type: "text", text: "Voir " },
      { type: "mention", userId: "u1" },
      { type: "text", text: " demain" },
    ]);
  });
  it("renders plain text with names", () => {
    expect(plainNote("<@u1> ok", new Map([["u1", "Claire Dubois"]]))).toBe("@Claire Dubois ok");
  });
});
