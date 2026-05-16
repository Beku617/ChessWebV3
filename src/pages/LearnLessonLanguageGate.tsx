import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LearnLesson from "./LearnLesson";
import LearnLessonMN from "./LearnLessonMN";
import { useAuthStore } from "../store/authStore";
import {
  fetchLearnLesson as fetchLearnLessonEn,
  fetchLearnPairMapping as fetchLearnPairMappingEn,
} from "../features/learn/api";
import {
  fetchLearnLesson as fetchLearnLessonMn,
  fetchLearnPairMapping as fetchLearnPairMappingMn,
} from "../features/learnMn/api";
import { useLanguageAvailabilityStore } from "../store/languageAvailabilityStore";

type LearnLanguage = "en" | "mn";

const LANGUAGE_STORAGE_KEY = "ng_lang";
const PAIR_ID_PATTERN = /^\d{5}$/;

function normalizeLanguage(value: unknown): LearnLanguage {
  const normalized = String(value || "").toLowerCase();
  return normalized.startsWith("mn") ? "mn" : "en";
}

function readStoredLanguage(): LearnLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);
  return normalizeLanguage(window.localStorage.getItem("i18nextLng"));
}

function persistLanguage(language: LearnLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  window.localStorage.setItem("i18nextLng", language);
}

function normalizePairId(value: unknown): string {
  const normalized = String(value || "").trim();
  return PAIR_ID_PATTERN.test(normalized) ? normalized : "";
}

export default function LearnLessonLanguageGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const { courseSlug = "", lessonSlug = "" } = useParams<{
    courseSlug: string;
    lessonSlug: string;
  }>();
  const { i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setLearnMnUnavailable = useLanguageAvailabilityStore(
    (state) => state.setLearnMnUnavailable,
  );

  const [requestedLanguage, setRequestedLanguage] = useState<LearnLanguage>(() =>
    readStoredLanguage(),
  );
  const [language, setLanguage] = useState<LearnLanguage>(() => readStoredLanguage());

  useEffect(() => {
    const profileLanguage =
      user?.preferredLanguage === "mn" || user?.preferredLanguage === "en"
        ? user.preferredLanguage
        : null;
    const storedLanguage = readStoredLanguage();
    const i18nLanguage = normalizeLanguage(i18n.resolvedLanguage || i18n.language || "en");

    // Always honor the actively selected UI language first.
    const nextLanguage = i18nLanguage || profileLanguage || storedLanguage || "en";
    setRequestedLanguage(nextLanguage);
    persistLanguage(nextLanguage);
  }, [i18n.language, i18n.resolvedLanguage, user?.preferredLanguage]);

  useEffect(() => {
    let cancelled = false;

    const safeFetchLessonEn = async () => {
      try {
        return await fetchLearnLessonEn(courseSlug, lessonSlug);
      } catch {
        return null;
      }
    };

    const safeFetchLessonMn = async () => {
      try {
        return await fetchLearnLessonMn(courseSlug, lessonSlug);
      } catch {
        return null;
      }
    };

    const safeFetchPairEn = async (pairId: string) => {
      try {
        return await fetchLearnPairMappingEn(pairId);
      } catch {
        return null;
      }
    };

    const safeFetchPairMn = async (pairId: string) => {
      try {
        return await fetchLearnPairMappingMn(pairId);
      } catch {
        return null;
      }
    };

    const resolveLanguage = async () => {
      if (!courseSlug || !lessonSlug) {
        setLanguage(requestedLanguage);
        return;
      }

      if (requestedLanguage === "en") {
        const englishBySlug = await safeFetchLessonEn();
        if (englishBySlug) {
          if (!cancelled) {
            setLanguage("en");
            setLearnMnUnavailable(false);
          }
          return;
        }

        const mongolianBySlug = await safeFetchLessonMn();
        const pairId = normalizePairId(mongolianBySlug?.lesson?.pairId);
        if (pairId) {
          const mapping = await safeFetchPairEn(pairId);
          if (mapping?.lesson?.courseSlug && mapping.lesson.slug) {
            if (cancelled) return;
            setLanguage("en");
            setLearnMnUnavailable(false);
            const nextPath = `/learn/${mapping.lesson.courseSlug}/${mapping.lesson.slug}`;
            if (nextPath !== location.pathname) {
              navigate(nextPath, { replace: true });
            }
            return;
          }
        }

        if (!cancelled) {
          setLanguage("en");
          setLearnMnUnavailable(false);
          navigate("/learn", { replace: true });
        }
        return;
      }

      const mongolianBySlug = await safeFetchLessonMn();
      if (mongolianBySlug) {
        if (!cancelled) {
          setLanguage("mn");
          setLearnMnUnavailable(false);
        }
        return;
      }

      const englishBySlug = await safeFetchLessonEn();
      if (englishBySlug) {
        const pairId = normalizePairId(englishBySlug?.lesson?.pairId);
        if (!pairId) {
          if (!cancelled) {
            setLanguage("en");
            setLearnMnUnavailable(true);
          }
          return;
        }

        const mapping = await safeFetchPairMn(pairId);
        if (mapping?.lesson?.courseSlug && mapping.lesson.slug) {
          if (cancelled) return;
          setLanguage("mn");
          setLearnMnUnavailable(false);
          const nextPath = `/learn/${mapping.lesson.courseSlug}/${mapping.lesson.slug}`;
          if (nextPath !== location.pathname) {
            navigate(nextPath, { replace: true });
          }
          return;
        }

        if (!cancelled) {
          setLanguage("en");
          setLearnMnUnavailable(true);
        }
        return;
      }

      if (!cancelled) {
        setLanguage("en");
        setLearnMnUnavailable(true);
        navigate("/learn", { replace: true });
      }
    };

    void resolveLanguage();

    return () => {
      cancelled = true;
    };
  }, [
    courseSlug,
    lessonSlug,
    location.pathname,
    navigate,
    requestedLanguage,
    setLearnMnUnavailable,
  ]);

  const lessonViewKey = useMemo(
    () => `${language}:${location.pathname}`,
    [language, location.pathname],
  );

  const ActiveLessonComponent = language === "mn" ? LearnLessonMN : LearnLesson;

  return <ActiveLessonComponent key={lessonViewKey} />;
}

