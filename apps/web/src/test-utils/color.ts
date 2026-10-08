/** Colour maths for tests: parses theme.css tokens and measures WCAG contrast. */

export type Rgb = [number, number, number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** OKLCH (CSS Color 4) to 8-bit sRGB. */
export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const encode = (x: number) => {
    const v = clamp01(x);
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  };
  return linear.map((x) => Math.round(encode(x) * 255)) as Rgb;
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG 2.x contrast ratio, 1 (none) to 21 (black on white). */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Alpha-composites `foreground` (with `alpha`) over an opaque background. */
export function over(foreground: Rgb, alpha: number, background: Rgb): Rgb {
  return foreground.map((channel, index) =>
    Math.round(channel * alpha + background[index]! * (1 - alpha)),
  ) as Rgb;
}

/**
 * Reads `--token: oklch(L C H)` declarations from one CSS rule (`:root` or
 * `.dark`) and resolves `var(--other)` aliases within it.
 */
export function readTokens(css: string, selector: ":root" | ".dark") {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`rule ${selector} not found`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const raw = new Map<string, string>();
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g))
    raw.set(match[1]!, match[2]!.trim());
  return raw;
}

export function resolveToken(
  name: string,
  ...layers: Array<Map<string, string>>
): Rgb {
  for (const layer of layers) {
    const value = layer.get(name);
    if (value === undefined) continue;
    const alias = /^var\(--([\w-]+)\)$/.exec(value);
    if (alias) return resolveToken(alias[1]!, ...layers);
    const oklch =
      /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.]+)?\)$/.exec(
        value,
      );
    if (oklch)
      return oklchToRgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
    throw new Error(`token --${name} has unsupported value: ${value}`);
  }
  throw new Error(`token --${name} is not defined`);
}
