/** Translator signature for keys computed at runtime (error codes returned by actions). */
export type LooseT = (key: string, values?: Record<string, string | number | Date>) => string;

export function loose(t: unknown): LooseT {
  return t as LooseT;
}
