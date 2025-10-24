export type SchoolColor = {
  r: number;
  g: number;
  b: number;
};

function clampColorComponent(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function blendWithWhite(channel: number, ratio: number): number {
  return clampColorComponent(channel + (255 - channel) * ratio);
}

function toRgba(color: SchoolColor, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function lighten(color: SchoolColor, ratio: number): SchoolColor {
  return {
    r: blendWithWhite(color.r, ratio),
    g: blendWithWhite(color.g, ratio),
    b: blendWithWhite(color.b, ratio),
  };
}

type UniversityColorRecord = {
  colorRgb?: {
    r?: unknown;
    g?: unknown;
    b?: unknown;
  };
};

export function extractSchoolColor(university: unknown): SchoolColor | null {
  if (!university || typeof university !== 'object') {
    return null;
  }

  const record = university as UniversityColorRecord;
  const raw = record.colorRgb;
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const { r, g, b } = raw;
  if (
    typeof r === 'number'
    && Number.isFinite(r)
    && typeof g === 'number'
    && Number.isFinite(g)
    && typeof b === 'number'
    && Number.isFinite(b)
  ) {
    return {
      r: clampColorComponent(r),
      g: clampColorComponent(g),
      b: clampColorComponent(b),
    };
  }

  return null;
}

export type UniversityCardAccentStyles = {
  borderColor: string;
  background: string;
  boxShadow: string;
  accentBar: string;
  buttonSolid: string;
  buttonOutline: string;
};

export function createUniversityCardAccentStyles(color: SchoolColor | null): UniversityCardAccentStyles {
  if (!color) {
    return {
      borderColor: 'rgba(148, 163, 184, 0.4)',
      background: 'linear-gradient(135deg, rgba(240, 249, 255, 0.98), rgba(255, 255, 255, 0.94))',
      boxShadow: '0 18px 42px rgba(148, 163, 184, 0.25)',
      accentBar: 'linear-gradient(90deg, rgba(37, 99, 235, 0.55), rgba(96, 165, 250, 0.4))',
      buttonSolid: 'linear-gradient(135deg, rgba(37, 99, 235, 0.92), rgba(59, 130, 246, 0.78))',
      buttonOutline: 'rgba(148, 163, 184, 0.55)',
    } satisfies UniversityCardAccentStyles;
  }

  const { r, g, b } = color;
  const rgba = (alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

  return {
    borderColor: rgba(0.45),
    background: `linear-gradient(135deg, ${rgba(0.18)}, rgba(255, 255, 255, 0.94))`,
    boxShadow: `0 22px 46px ${rgba(0.2)}`,
    accentBar: `linear-gradient(90deg, ${rgba(0.65)}, ${rgba(0.32)})`,
    buttonSolid: `linear-gradient(135deg, ${rgba(0.9)}, ${rgba(0.7)})`,
    buttonOutline: rgba(0.4),
  } satisfies UniversityCardAccentStyles;
}

export type UniversityHeroAccentStyles = {
  containerBackground: string;
  containerBorder: string;
  containerShadow: string;
  overlay: string;
  badgeBackground: string;
  badgeColor: string;
  highlightColor: string;
  linkColor: string;
  linkHoverColor: string;
  accentBar: string;
  buttonBackground: string;
  buttonHoverBackground: string;
  buttonShadow: string;
  pillBorderColor: string;
};

export function createUniversityHeroAccentStyles(color: SchoolColor | null): UniversityHeroAccentStyles {
  if (!color) {
    return {
      containerBackground: 'linear-gradient(135deg, rgba(59, 130, 246, 0.88), rgba(29, 78, 216, 0.85))',
      containerBorder: 'rgba(59, 130, 246, 0.45)',
      containerShadow: '0 28px 60px rgba(30, 64, 175, 0.35)',
      overlay:
        'radial-gradient(circle at 15% 20%, rgba(191, 219, 254, 0.35), transparent 55%), radial-gradient(circle at 85% 10%, rgba(191, 219, 254, 0.25), transparent 45%)',
      badgeBackground: 'rgba(255, 255, 255, 0.18)',
      badgeColor: 'rgba(255, 255, 255, 0.9)',
      highlightColor: 'rgba(219, 234, 254, 0.92)',
      linkColor: 'rgba(240, 249, 255, 0.95)',
      linkHoverColor: 'rgba(255, 255, 255, 1)',
      accentBar: 'linear-gradient(90deg, rgba(59, 130, 246, 0.85), rgba(191, 219, 254, 0.5))',
      buttonBackground: 'linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(29, 78, 216, 0.88))',
      buttonHoverBackground: 'linear-gradient(135deg, rgba(59, 130, 246, 0.98), rgba(29, 78, 216, 0.92))',
      buttonShadow: '0 18px 36px rgba(30, 64, 175, 0.32)',
      pillBorderColor: 'rgba(255, 255, 255, 0.4)',
    } satisfies UniversityHeroAccentStyles;
  }

  const base: SchoolColor = {
    r: color.r,
    g: color.g,
    b: color.b,
  };
  const soft = lighten(base, 0.35);
  const bright = lighten(base, 0.62);
  const highlight = lighten(base, 0.75);

  return {
    containerBackground: `linear-gradient(135deg, ${toRgba(base, 0.92)}, ${toRgba(soft, 0.88)})`,
    containerBorder: toRgba(base, 0.45),
    containerShadow: `0 28px 60px ${toRgba(base, 0.32)}`,
    overlay: `radial-gradient(circle at 18% 22%, ${toRgba(bright, 0.55)}, transparent 58%), radial-gradient(circle at 82% 10%, ${toRgba(highlight, 0.42)}, transparent 48%)`,
    badgeBackground: toRgba(highlight, 0.25),
    badgeColor: 'rgba(255, 255, 255, 0.92)',
    highlightColor: toRgba(highlight, 0.92),
    linkColor: 'rgba(255, 255, 255, 0.92)',
    linkHoverColor: 'rgba(255, 255, 255, 1)',
    accentBar: `linear-gradient(90deg, ${toRgba(base, 0.85)}, ${toRgba(bright, 0.55)})`,
    buttonBackground: `linear-gradient(135deg, ${toRgba(base, 0.92)}, ${toRgba(bright, 0.78)})`,
    buttonHoverBackground: `linear-gradient(135deg, ${toRgba(base, 0.98)}, ${toRgba(bright, 0.86)})`,
    buttonShadow: `0 18px 36px ${toRgba(base, 0.28)}`,
    pillBorderColor: toRgba(highlight, 0.4),
  } satisfies UniversityHeroAccentStyles;
}

