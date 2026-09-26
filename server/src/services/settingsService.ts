import { prisma } from "../lib/prisma.js";

export const DEFAULT_CHART_COLORS = {
  primary: "#6366F1",
  secondary: "#8B5CF6",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#06B6D4",
  accent: "#EC4899",
} as const;
export type ChartColorKey = keyof typeof DEFAULT_CHART_COLORS;
export type ChartColors = Record<ChartColorKey, string>;

const COLUMN: Record<ChartColorKey, string> = {
  primary: "primaryColor",
  secondary: "secondaryColor",
  success: "successColor",
  warning: "warningColor",
  danger: "dangerColor",
  info: "infoColor",
  accent: "accentColor",
};

export async function getChartColors(): Promise<ChartColors> {
  const row = await prisma.chartSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  const r = row as unknown as Record<string, string>;
  return Object.fromEntries(Object.entries(COLUMN).map(([k, col]) => [k, r[col]!.toUpperCase()])) as ChartColors;
}

export async function updateChartColors(patch: Partial<ChartColors>): Promise<ChartColors> {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v && k in COLUMN) data[COLUMN[k as ChartColorKey]] = v.toUpperCase();
  }
  await prisma.chartSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  return getChartColors();
}

export async function resetChartColors(): Promise<ChartColors> {
  return updateChartColors({ ...DEFAULT_CHART_COLORS });
}
