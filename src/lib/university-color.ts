export type SchoolColor = {
  r: number;
  g: number;
  b: number;
};

function clampColorComponent(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
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
