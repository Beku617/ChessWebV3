import { useState, useEffect, useCallback } from "react";
import { TransformedLiveGame, TransformedStreamer } from "../utils/lichessApi";
import { liveGames as mockLiveGames } from "../data/mockData";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Types for featured events from our backend
export interface FeaturedEvent {
  _id: string;
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

// Hook for fetching live games from Lichess
export function useLichessLiveGames() {
  const [games, setGames] = useState<TransformedLiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buildFallbackGames = () => {
    const toCategory = (time: string) => {
      const match = time.match(/^([0-9.]+)\+(\d+)/);
      if (!match) return "Blitz";
      const minutes = parseFloat(match[1]);
      if (minutes <= 8) return "Blitz";
      if (minutes <= 25) return "Rapid";
      return "Classical";
    };

    return mockLiveGames.map((game, index) => {
      const category = toCategory(game.timeControl);
      return {
        id: `${game.id}-${index}`,
        white: game.players.white,
        whiteRating: 1500,
        whiteTitle: undefined,
        black: game.players.black,
        blackRating: 1500,
        blackTitle: undefined,
        viewers: `${game.viewers}`,
        time: game.timeControl,
        type: category,
        category,
        speed: category.toLowerCase(),
        gameUrl: "https://lichess.org",
      };
    });
  };

  const fetchGames = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/lichess/tv`);
      if (!response.ok) throw new Error("Failed to fetch live games");
      const data = await response.json();
      setGames(data.games || buildFallbackGames());
      setError(null);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.warn("Live games fetch failed, using fallback:", err);
      }
      setError("Offline mode — showing sample games.");
      setGames(buildFallbackGames());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
    // No polling to avoid repeated errors when offline.
  }, [fetchGames]);

  return { games, loading, error, refetch: fetchGames };
}

// Hook for fetching streamers from Lichess
export function useLichessStreamers() {
  const [streamers, setStreamers] = useState<TransformedStreamer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fallbackStreamers: TransformedStreamer[] = [
    {
      id: "1",
      name: "ChessLive",
      title: "IM",
      viewers: "1200",
      streamTitle: "Live chess show",
      avatar: "C",
      platform: "twitch",
      url: "https://lichess.org",
    },
    {
      id: "2",
      name: "RapidBlitz",
      title: "GM",
      viewers: "980",
      streamTitle: "Speed chess",
      avatar: "R",
      platform: "youtube",
      url: "https://lichess.org",
    },
  ];

  const fetchStreamersData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/lichess/streamers`);
      if (!res.ok) throw new Error("Failed to fetch streamers");
      const data = await res.json();
      setStreamers(data.streamers || fallbackStreamers);
      setError(null);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.warn("Streamers fetch failed, using fallback:", err);
      }
      setError("Offline mode — sample streamers.");
      setStreamers(fallbackStreamers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStreamersData();
    // No polling to avoid repeated errors when offline.
  }, [fetchStreamersData]);

  return { streamers, loading, error, refetch: fetchStreamersData };
}

// Hook for fetching featured events from our backend
export function useFeaturedEvents() {
  const [events, setEvents] = useState<FeaturedEvent[]>([]);
  const [featuredEvent, setFeaturedEvent] = useState<FeaturedEvent | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/featured-events?limit=10`, {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to fetch events");

      const data = await response.json();
      setEvents(data);

      // Find the main featured event (highest priority with featured=true)
      const mainFeatured =
        data.find((e: FeaturedEvent) => e.featured && e.status === "live") ||
        data.find((e: FeaturedEvent) => e.featured) ||
        data[0];
      setFeaturedEvent(mainFeatured || null);
      setError(null);
    } catch (err) {
      setError("Failed to fetch featured events");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, featuredEvent, loading, error, refetch: fetchEvents };
}

// Combined hook for all watch page data
export function useWatchPageData() {
  const lichessGames = useLichessLiveGames();
  const lichessStreamers = useLichessStreamers();
  const featuredEvents = useFeaturedEvents();

  return {
    liveGames: lichessGames,
    streamers: lichessStreamers,
    featured: featuredEvents,
    isLoading:
      lichessGames.loading ||
      lichessStreamers.loading ||
      featuredEvents.loading,
  };
}
