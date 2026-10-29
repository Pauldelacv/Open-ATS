import { describe, expect, it } from "vitest";
import {
  isAutomaticReply,
  messageIdList,
  normalizeMessageId,
  stripQuotedText,
} from "@/lib/mail/reply";

describe("message ids", () => {
  it("removes brackets and refuses values with spaces", () => {
    expect(normalizeMessageId("<abc@jobs.example>")).toBe("abc@jobs.example");
    expect(normalizeMessageId("abc@jobs.example")).toBe("abc@jobs.example");
    expect(normalizeMessageId("not an id")).toBeNull();
    expect(normalizeMessageId(null)).toBeNull();
  });

  it("lists In-Reply-To first, then References from the most recent", () => {
    expect(messageIdList("<c@x>", "<a@x> <b@x> <c@x>")).toEqual(["c@x", "b@x", "a@x"]);
    expect(messageIdList(undefined, ["<a@x>", "<b@x>"])).toEqual(["b@x", "a@x"]);
  });
});

describe("automatic replies", () => {
  const headers = (entries: Record<string, unknown>) => new Map(Object.entries(entries));
  it("recognises out-of-office, lists and delivery reports", () => {
    expect(isAutomaticReply(headers({ "auto-submitted": "auto-replied" }))).toBe(true);
    expect(isAutomaticReply(headers({ "x-autoreply": "yes" }))).toBe(true);
    expect(isAutomaticReply(headers({ precedence: "bulk" }))).toBe(true);
    expect(isAutomaticReply(headers({ "list-id": "<news.example>" }))).toBe(true);
    expect(
      isAutomaticReply(headers({ "content-type": { value: "multipart/report", params: {} } })),
    ).toBe(true);
  });
  it("lets a person's reply through", () => {
    expect(isAutomaticReply(headers({ "auto-submitted": "no" }))).toBe(false);
    expect(isAutomaticReply(headers({ "content-type": { value: "text/plain" } }))).toBe(false);
  });
});

describe("quoted text", () => {
  it("cuts at a French Gmail header spread over two lines", () => {
    const text = [
      "Bonjour,",
      "",
      "Je suis disponible jeudi.",
      "",
      "Le jeu. 29 oct. 2026 à 10:00, Camille Roussel <",
      "camille@maison-pivert.example> a écrit :",
      "> Bonjour Marion,",
    ].join("\n");
    expect(stripQuotedText(text)).toEqual({
      body: "Bonjour,\n\nJe suis disponible jeudi.",
      quoted: true,
    });
  });

  it("cuts at an English header and at an Outlook block", () => {
    expect(
      stripQuotedText("Thanks!\n\nOn Thu, Oct 29, 2026 at 10:00 AM Camille wrote:\n> Hi").body,
    ).toBe("Thanks!");
    const outlook = [
      "Merci pour votre retour.",
      "",
      "De : Maison Pivert <jobs@maison-pivert.example>",
      "Envoyé : jeudi 29 octobre 2026 10:00",
      "À : Marion Lefort",
      "Objet : Votre candidature",
    ].join("\n");
    expect(stripQuotedText(outlook).body).toBe("Merci pour votre retour.");
  });

  it("cuts at a trailing block of quoted lines but keeps inline quotes", () => {
    expect(stripQuotedText("Oui, parfait.\n\n> Pouvez-vous jeudi ?\n> Cordialement").body).toBe(
      "Oui, parfait.",
    );
    const inline = "> Pouvez-vous jeudi ?\nOui.\n> Et vendredi ?\nAussi.";
    expect(stripQuotedText(inline)).toEqual({ body: inline, quoted: false });
  });

  it("keeps everything when nothing new was written above the quote", () => {
    const text = "Le jeu. 29 oct. 2026, Camille a écrit :\n> Bonjour";
    expect(stripQuotedText(text)).toEqual({ body: text, quoted: false });
  });
});
