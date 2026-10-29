/** Variables available in email templates, with their French and English names. */
export const templateVariables = [
  { key: "firstName", names: ["prénom", "prenom", "first_name", "firstname"] },
  { key: "lastName", names: ["nom", "last_name", "lastname"] },
  { key: "job", names: ["offre", "poste", "job"] },
  { key: "company", names: ["entreprise", "company"] },
  { key: "recruiter", names: ["recruteur", "recruiter"] },
  { key: "slotsLink", names: ["lien_creneaux", "lien_créneaux", "slots_link"] },
  { key: "interviewDate", names: ["date_entretien", "interview_date"] },
  { key: "interviewLocation", names: ["lieu_entretien", "interview_location"] },
] as const;

export type TemplateValues = Partial<Record<(typeof templateVariables)[number]["key"], string>>;

const lookup = new Map<string, (typeof templateVariables)[number]["key"]>();
for (const variable of templateVariables)
  for (const name of variable.names) lookup.set(name, variable.key);

const PATTERN = /\{\{\s*([\p{L}_]+)\s*\}\}/gu;

/** Replaces known variables; unknown ones are left untouched so that the preview shows them. */
export function renderTemplate(text: string, values: TemplateValues): string {
  return text.replace(PATTERN, (match, name: string) => {
    const key = lookup.get(name.toLowerCase());
    if (!key) return match;
    return values[key] ?? "";
  });
}

/** Variables used in `text` that are not recognised. */
export function unknownVariables(text: string): string[] {
  const unknown = new Set<string>();
  for (const [, name] of text.matchAll(PATTERN))
    if (name && !lookup.has(name.toLowerCase())) unknown.add(name);
  return [...unknown];
}

/** Whether `text` uses a variable, under any of its names. */
export function usesVariable(
  text: string,
  key: (typeof templateVariables)[number]["key"],
): boolean {
  for (const [, name] of text.matchAll(PATTERN))
    if (name && lookup.get(name.toLowerCase()) === key) return true;
  return false;
}
