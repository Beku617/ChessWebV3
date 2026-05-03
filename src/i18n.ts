import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/translation.json";
import enUi from "./locales/en/ui.json";
import mn from "./locales/mn/translation.json";
import mnUi from "./locales/mn/ui.json";

const resources = {
  en: { translation: { ...en, ...enUi } },
  mn: { translation: { ...mn, ...mnUi } },
};

export const supportedLanguages = [
  { code: "mn", name: "\u041c\u043e\u043d\u0433\u043e\u043b" },
  { code: "en", name: "English" },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "mn",
    supportedLngs: supportedLanguages.map((l) => l.code),
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    load: "languageOnly",
  });

export default i18n;
