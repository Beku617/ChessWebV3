import { useState, useEffect, useCallback } from "react";
import type { WatchLiveGame } from "../pages/watch/types";
import { useFriendChallengeStore } from "../store/friendChallengeStore";
import { useAuthStore } from "../store/authStore";
import { useTranslation } from "react-i18next";
import { useLanguageAvailabilityStore } from "../store/languageAvailabilityStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const WATCH_LIVE_GAMES_ENDPOINT = `${API_URL}/api/watch/live-games`;
const EVENTS_ENDPOINT = `${API_URL}/api/events?limit=10`;
const EVENTS_MN_PAIR_ENDPOINT = `${API_URL}/api/events-mn/pair`;
const LANGUAGE_STORAGE_KEY = "ng_lang";
const PAIR_ID_PATTERN = /^\d{5}$/;

// Types for featured events from our backend
export interface FeaturedEvent {
  _id: string;
  pairId?: string;
  title: string;
  description?: string;
  type: "tournament" | "match" | "broadcast" | "event";
  lichessUrl?: string;
  imageUrl?: string;
  statusLabel?: string;
  categoryLabel?: string;
  viewerCountText?: string;
  primaryButtonLabel?: string;
  primaryButtonUrl?: string;
  secondaryButtonLabel?: string;
  secondaryButtonUrl?: string;
  backgroundType?: "default" | "color" | "image";
  backgroundColor?: string;
  backgroundImageUrl?: string;
  primaryButtonColor?: string;
  titleColor?: string;
  descriptionColor?: string;
  players?: {
    name: string;
    rating: number;
    title?: string;
    country?: string;
  }[];
  startDate?: string;
  endDate?: string;
  status: "upcoming" | "live" | "completed";
  featured: boolean;
  priority: number;
  isActive: boolean;
  viewers: number;
  tags?: string[];
}

type PreferredLanguage = "en" | "mn";

function normalizePreferredLanguage(value: unknown): PreferredLanguage {
  return String(value || "").toLowerCase() === "mn" ? "mn" : "en";
}

function readStoredPreferredLanguage(): PreferredLanguage {
  if (typeof window === "undefined") return "en";
  return normalizePreferredLanguage(
    window.localStorage.getItem(LANGUAGE_STORAGE_KEY),
  );
}

function persistPreferredLanguage(language: PreferredLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

function normalizePairId(value: unknown): string {
  const normalized = String(value || "").trim();
  return PAIR_ID_PATTERN.test(normalized) ? normalized : "";
}

async function fetchFeaturedEventsFromApi(endpoint: string): Promise<FeaturedEvent[]> {
  const response = await fetch(endpoint, {
    credentials: "include",
  });

  if (!response.ok) throw new Error("Failed to fetch events");

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function fetchEventPairMappingMn(
  pairId: string,
): Promise<FeaturedEvent | null> {
  const response = await fetch(
    `${EVENTS_MN_PAIR_ENDPOINT}/${encodeURIComponent(pairId)}`,
    {
      credentials: "include",
    },
  );
  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") return null;

  const mappedEvent = (data as { event?: FeaturedEvent | null }).event;
  return mappedEvent || null;
}

function normalizeWatchLiveGame(raw: any): WatchLiveGame {
  const viewers = Number(raw?.viewers);
  return {
    id: String(raw?.id || ""),
    white: String(raw?.white || "White"),
    whiteRating: Number.isFinite(Number(raw?.whiteRating))
      ? Number(raw.whiteRating)
      : 1200,
    whiteTitle: raw?.whiteTitle ? String(raw.whiteTitle) : undefined,
    black: String(raw?.black || "Black"),
    blackRating: Number.isFinite(Number(raw?.blackRating))
      ? Number(raw.blackRating)
      : 1200,
    blackTitle: raw?.blackTitle ? String(raw.blackTitle) : undefined,
    viewers: Number.isFinite(viewers) ? viewers : 0,
    time: String(raw?.time || "0+0"),
    type: String(raw?.type || "Blitz"),
    category: raw?.category ? String(raw.category) : undefined,
    speed: String(raw?.speed || "blitz"),
    gameUrl: raw?.gameUrl ? String(raw.gameUrl) : undefined,
  };
}

function extractGamesFromPayload(payload: unknown): WatchLiveGame[] {
  const rawList =
    Array.isArray(payload)
      ? payload
      : payload &&
          typeof payload === "object" &&
          Array.isArray((payload as any).games)
        ? (payload as any).games
        : [];

  return rawList
    .map((entry: any) => normalizeWatchLiveGame(entry))
    .filter((game) => game.id.length > 0);
}

function isUnauthorizedError(error: unknown): boolean {
  return (error as { status?: number } | undefined)?.status === 401;
}

async function fetchWatchLiveGamesFromApi(): Promise<WatchLiveGame[]> {
  const response = await fetch(WATCH_LIVE_GAMES_ENDPOINT, {
    credentials: "include",
  });

  if (response.status === 401) {
    const unauthorizedError = new Error("UNAUTHORIZED");
    (unauthorizedError as Error & { status?: number }).status = 401;
    throw unauthorizedError;
  }

  if (!response.ok) {
    throw new Error("Failed to fetch watch live games");
  }

  const data = await response.json();
  return extractGamesFromPayload(data);
}

// Dashboard live games: same source as /watch
export function useDashboardLiveGames() {
  const [games, setGames] = useState<WatchLiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGames = useCallback(async () => {
    try {
      setLoading(true);
      const nextGames = await fetchWatchLiveGamesFromApi();
      setGames(nextGames);
      setError(null);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        setError("Unauthorized (401): please log in again.");
      } else {
        console.error("Dashboard live games fetch failed:", err);
        setError("Unable to load live games right now.");
      }
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGames();
  }, [fetchGames]);

  return { games, loading, error, refetch: fetchGames };
}

export function useWatchLiveGames() {
  const [games, setGames] = useState<WatchLiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socket = useFriendChallengeStore((state) => state.socket);
  const isConnected = useFriendChallengeStore((state) => state.isConnected);

  const fetchGames = useCallback(async () => {
    try {
      setLoading(true);
      const nextGames = await fetchWatchLiveGamesFromApi();
      setGames(nextGames);
      setError(null);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        setError("Unauthorized (401): please log in again.");
      } else {
        console.error("Watch live games fetch failed:", err);
        setError("Unable to load live games right now.");
      }
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGames();
    if (error && error.startsWith("Unauthorized (401)")) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      void fetchGames();
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [error, fetchGames]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleWatchLiveGamesUpdated = (payload: unknown) => {
      const nextGames = extractGamesFromPayload(payload);
      setGames(nextGames);
      setLoading(false);
      setError(null);
    };

    socket.on("watchLiveGamesUpdated", handleWatchLiveGamesUpdated);
    return () => {
      socket.off("watchLiveGamesUpdated", handleWatchLiveGamesUpdated);
    };
  }, [isConnected, socket]);

  return { games, loading, error, refetch: fetchGames };
}

// Hook for fetching featured events from our backend
export function useFeaturedEvents() {
  const userPreferredLanguage = useAuthStore((state) =>
    state.user?.preferredLanguage === "mn" ? "mn" : state.user?.preferredLanguage === "en" ? "en" : null,
  );
  const setEventsMnUnavailable = useLanguageAvailabilityStore(
    (state) => state.setEventsMnUnavailable,
  );
  const { i18n } = useTranslation();
  const [events, setEvents] = useState<FeaturedEvent[]>([]);
  const [featuredEvent, setFeaturedEvent] = useState<FeaturedEvent | null>(
    null,
  );
  const [language, setLanguage] = useState<PreferredLanguage>(() => {
    if (userPreferredLanguage) return userPreferredLanguage;
    const storedLanguage = readStoredPreferredLanguage();
    if (storedLanguage) return storedLanguage;
    return normalizePreferredLanguage("en");
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextLanguage =
      userPreferredLanguage ||
      readStoredPreferredLanguage() ||
      normalizePreferredLanguage(i18n.resolvedLanguage || i18n.language || "en");
    setLanguage(nextLanguage);
    persistPreferredLanguage(nextLanguage);
  }, [i18n.language, i18n.resolvedLanguage, userPreferredLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateFromStorage = () => {
      if (userPreferredLanguage) return;
      setLanguage(readStoredPreferredLanguage());
    };

    window.addEventListener("storage", updateFromStorage);
    window.addEventListener("focus", updateFromStorage);
    return () => {
      window.removeEventListener("storage", updateFromStorage);
      window.removeEventListener("focus", updateFromStorage);
    };
  }, [userPreferredLanguage]);

  const applyEventsState = useCallback((nextEvents: FeaturedEvent[]) => {
    setEvents(nextEvents);
    const mainFeatured =
      nextEvents.find((event) => event.featured && event.status === "live") ||
      nextEvents.find((event) => event.featured) ||
      nextEvents[0] ||
      null;
    setFeaturedEvent(mainFeatured);
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      if (language === "en") {
        const englishEvents = await fetchFeaturedEventsFromApi(EVENTS_ENDPOINT);
        applyEventsState(englishEvents);
        setEventsMnUnavailable(false);
        setError(null);
        return;
      }

      const englishEvents = await fetchFeaturedEventsFromApi(EVENTS_ENDPOINT);
      const mappedEvents = await Promise.all(
        englishEvents.map(async (event) => {
          const pairId = normalizePairId(event?.pairId);
          if (!pairId) {
            return { event, isFallback: true };
          }

          const translatedEvent = await fetchEventPairMappingMn(pairId);
          if (!translatedEvent) {
            return { event, isFallback: true };
          }

          return { event: translatedEvent, isFallback: false };
        }),
      );

      const fallbackTriggered = mappedEvents.some((entry) => entry.isFallback);
      const visibleEvents = mappedEvents.map((entry) => entry.event);
      applyEventsState(visibleEvents);
      setEventsMnUnavailable(fallbackTriggered);
      setError(null);
    } catch (err) {
      if (language === "mn") {
        try {
          const englishEvents = await fetchFeaturedEventsFromApi(EVENTS_ENDPOINT);
          applyEventsState(englishEvents);
          setEventsMnUnavailable(true);
          setError(null);
          return;
        } catch {
          // Fall through to generic error handling below.
        }
      }
      if (language === "en") {
        setEventsMnUnavailable(false);
      } else {
        setEventsMnUnavailable(true);
      }
      setError("Failed to fetch featured events");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [applyEventsState, language, setEventsMnUnavailable]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return { events, featuredEvent, loading, error, refetch: fetchEvents };
}

// Combined hook for all watch page data
export function useWatchPageData() {
  const watchLiveGames = useWatchLiveGames();
  const featuredEvents = useFeaturedEvents();

  return {
    liveGames: watchLiveGames,
    featured: featuredEvents,
    isLoading: watchLiveGames.loading || featuredEvents.loading,
  };
}
