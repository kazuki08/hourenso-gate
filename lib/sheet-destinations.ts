export type SheetDestination = {
  id: string;
  label: string;
  sheetName?: string;
};

export function parseSheetDestinations(raw: string | undefined): SheetDestination[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        id: String(item.id ?? ""),
        label: String(item.label ?? ""),
        sheetName: item.sheetName ? String(item.sheetName) : undefined,
      }))
      .filter((item) => item.id !== "" && item.label !== "");
  } catch {
    return [];
  }
}

