import { describe, expect, it } from "vitest";
import { renderTemplate, unknownVariables } from "@/lib/services/template-render";
import { defaultTemplates } from "@/lib/services/default-templates";

describe("email templates", () => {
  const values = {
    firstName: "Marion",
    lastName: "Lefort",
    job: "Ébéniste",
    company: "Maison Pivert",
    recruiter: "Hugo",
  };

  it("replaces French and English variable names", () => {
    expect(renderTemplate("Bonjour {{prénom}}, poste {{offre}} chez {{entreprise}}", values)).toBe(
      "Bonjour Marion, poste Ébéniste chez Maison Pivert",
    );
    expect(
      renderTemplate("Hello {{first_name}} {{ last_name }} for {{job}} at {{company}}", values),
    ).toBe("Hello Marion Lefort for Ébéniste at Maison Pivert");
    expect(renderTemplate("{{prenom}} {{Prénom}}", values)).toBe("Marion Marion");
  });

  it("leaves unknown variables visible and reports them", () => {
    expect(renderTemplate("Bonjour {{surnom}}", values)).toBe("Bonjour {{surnom}}");
    expect(unknownVariables("{{prénom}} {{surnom}} {{date}}")).toEqual(["surnom", "date"]);
  });

  it("default templates only use known variables", () => {
    for (const list of Object.values(defaultTemplates)) {
      for (const template of list) {
        expect(unknownVariables(`${template.subject} ${template.body}`)).toEqual([]);
      }
    }
  });
});
