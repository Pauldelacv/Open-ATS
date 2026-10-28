/** Accessible colour set derived from an organisation's brand colour (career site only). */

type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1]!;
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as RGB;
}

function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance([r, g, b]: RGB): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

export function contrast(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(color: RGB, target: RGB, amount: number): RGB {
  return color.map((c, i) => c + (target[i]! - c) * amount) as RGB;
}

const INK = "#18233A";
const WHITE = "#FFFFFF";
const DEFAULT = "#2447D6";

export type BrandPalette = { brand: string; brandHover: string; brandFg: string; brandLink: string };

export function brandPalette(input: string | null | undefined): BrandPalette {
  const rgb = parseHex(input ?? "") ?? parseHex(DEFAULT)!;
  const brand = toHex(rgb);
  const brandFg = contrast(brand, WHITE) >= contrast(brand, INK) ? WHITE : INK;
  // Hover goes towards the text colour so that it stays readable.
  const brandHover = toHex(mix(rgb, brandFg === WHITE ? [0, 0, 0] : [255, 255, 255], 0.14));
  let link = rgb;
  for (let i = 0; i < 20 && contrast(toHex(link), WHITE) < 4.5; i++) link = mix(link, [0, 0, 0], 0.12);
  return { brand, brandHover, brandFg, brandLink: toHex(link) };
}

export function isValidHex(value: string): boolean {
  return parseHex(value) !== null && /^#[0-9a-f]{6}$/i.test(value.trim());
}
