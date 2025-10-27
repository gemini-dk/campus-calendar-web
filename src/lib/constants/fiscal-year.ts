export const FISCAL_YEARS = ["2025", "2026"] as const;

export type FiscalYear = (typeof FISCAL_YEARS)[number];

export const DEFAULT_FISCAL_YEAR: FiscalYear = FISCAL_YEARS[0];
