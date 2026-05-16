import type { OpeningMatch } from "./openingExplorer";

type TranslationFn = (key: string, defaultValue?: string) => unknown;

function toOpeningKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function localizeOpeningText(value: string, t: TranslationFn) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  const key = `analysis.openingNames.${toOpeningKey(normalized)}`;
  const translatedByKey = t(key);
  if (translatedByKey !== key) {
    return String(translatedByKey);
  }

  const translatedByLabel = t(normalized);
  return translatedByLabel === normalized ? normalized : String(translatedByLabel);
}

export function formatLocalizedOpeningLabel(
  opening: Pick<OpeningMatch, "name" | "variation"> | null | undefined,
  t: TranslationFn,
) {
  if (!opening?.name) return "";

  const localizedName = localizeOpeningText(opening.name, t);
  if (!opening.variation) return localizedName;

  const localizedVariation = localizeOpeningText(opening.variation, t);
  return `${localizedName}: ${localizedVariation}`;
}
