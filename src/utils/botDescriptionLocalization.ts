export function parseBilingualBotDescription(rawDescription: string): {
  en: string;
  mn: string;
} | null {
  const normalized = String(rawDescription || "").trim();
  if (!normalized) return null;

  const enMarker = /EN\s*:/i.exec(normalized);
  const mnMarker = /MN\s*:/i.exec(normalized);
  if (!enMarker || !mnMarker) return null;
  if (
    typeof enMarker.index !== "number" ||
    typeof mnMarker.index !== "number" ||
    mnMarker.index <= enMarker.index
  ) {
    return null;
  }

  const enStart = enMarker.index + enMarker[0].length;
  const mnStart = mnMarker.index + mnMarker[0].length;
  const en = normalized.slice(enStart, mnMarker.index).trim();
  const mn = normalized.slice(mnStart).trim();
  if (!en && !mn) return null;

  return { en, mn };
}

export function resolveLocalizedBotDescription(
  rawDescription: string,
  language: string,
): string {
  const normalized = String(rawDescription || "").trim();
  if (!normalized) return "";

  const parsed = parseBilingualBotDescription(normalized);
  const normalizedLang = String(language || "").trim().toLowerCase();
  const useMongolian = normalizedLang.startsWith("mn");

  if (parsed) {
    return useMongolian ? parsed.mn || parsed.en : parsed.en || parsed.mn;
  }

  return normalized;
}
