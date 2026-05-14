import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Learn from "./Learn";
import LearnMN from "./LearnMN";
import { useAuthStore } from "../store/authStore";
import { fetchLearnCatalog as fetchLearnCatalogEn } from "../features/learn/api";
import { fetchLearnCatalog as fetchLearnCatalogMn } from "../features/learnMn/api";
import { useLanguageAvailabilityStore } from "../store/languageAvailabilityStore";

type LearnLanguage = "en" | "mn";

const LANGUAGE_STORAGE_KEY = "ng_lang";

function normalizeLanguage(value: unknown): LearnLanguage {
  return String(value || "").toLowerCase() === "mn" ? "mn" : "en";
}

function readStoredLanguage(): LearnLanguage {
  if (typeof window === "undefined") return "en";
  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

function persistLanguage(language: LearnLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export default function LearnLanguageGate() {
  const location = useLocation();
  const { i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setLearnMnUnavailable = useLanguageAvailabilityStore(
    (state) => state.setLearnMnUnavailable,
  );

  const [language, setLanguage] = useState<LearnLanguage>(() => readStoredLanguage());
  const [requestedLanguage, setRequestedLanguage] = useState<LearnLanguage>(() =>
    readStoredLanguage(),
  );

  useEffect(() => {
    const profileLanguage =
      user?.preferredLanguage === "mn" || user?.preferredLanguage === "en"
        ? user.preferredLanguage
        : null;
    const storedLanguage = readStoredLanguage();
    const i18nLanguage = normalizeLanguage(i18n.resolvedLanguage || i18n.language || "en");

    const nextLanguage = profileLanguage || storedLanguage || i18nLanguage || "en";
    setRequestedLanguage(nextLanguage);
    persistLanguage(nextLanguage);
  }, [i18n.language, i18n.resolvedLanguage, user?.preferredLanguage]);

  useEffect(() => {
    let cancelled = false;

    const resolveCatalogLanguage = async () => {
      if (requestedLanguage === "en") {
        if (!cancelled) {
          setLanguage("en");
          setLearnMnUnavailable(false);
        }
        return;
      }

      try {
        const mnCatalog = await fetchLearnCatalogMn({});
        if (cancelled) return;

        if (Array.isArray(mnCatalog?.courses) && mnCatalog.courses.length > 0) {
          setLanguage("mn");
          setLearnMnUnavailable(false);
          return;
        }

        setLanguage("en");
        setLearnMnUnavailable(true);
      } catch {
        try {
          await fetchLearnCatalogEn({});
          if (cancelled) return;
          setLanguage("en");
          setLearnMnUnavailable(true);
        } catch {
          if (!cancelled) {
            setLanguage("mn");
            setLearnMnUnavailable(false);
          }
        }
      }
    };

    void resolveCatalogLanguage();

    return () => {
      cancelled = true;
    };
  }, [requestedLanguage, setLearnMnUnavailable]);

  const pageKey = useMemo(
    () => `${language}:${location.pathname}`,
    [language, location.pathname],
  );

  const ActiveLearnComponent = language === "mn" ? LearnMN : Learn;
  return <ActiveLearnComponent key={pageKey} />;
}
