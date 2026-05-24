import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/translation.json";
import enUi from "./locales/en/ui.json";
import mn from "./locales/mn/translation.json";
import mnUi from "./locales/mn/ui.json";

export const ADMIN_LOCALE_STORAGE_KEY = "adminLocale";

export const adminSupportedLanguages = [
  { code: "en", name: "English" },
  { code: "mn", name: "\u041c\u043e\u043d\u0433\u043e\u043b" },
] as const;

const resources = {
  en: { translation: { ...en, ...enUi } },
  mn: { translation: { ...mn, ...mnUi } },
};

function readInitialAdminLocale(): string {
  if (typeof window === "undefined") return "en";
  const raw = window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY);
  if (raw === "en" || raw === "mn") return raw;
  return "en";
}

const adminI18n = createInstance();

void adminI18n.use(initReactI18next).init({
  resources,
  lng: readInitialAdminLocale(),
  fallbackLng: "en",
  supportedLngs: adminSupportedLanguages.map((lang) => lang.code),
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  load: "languageOnly",
});

export async function setAdminLocale(locale: string) {
  if (locale !== "en" && locale !== "mn") return;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, locale);
  }
  await adminI18n.changeLanguage(locale);
}

export default adminI18n;
