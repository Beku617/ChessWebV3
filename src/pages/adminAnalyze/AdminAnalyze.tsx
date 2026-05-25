import { Trans } from "react-i18next";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { GameHistory } from "../../historyTypes";
import { useAdminStore } from "../../store/adminStore";
import { API_URL } from "./types";
import { ReplayContent } from "../analyze/ReplayContent";

export default function AdminAnalyze() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const {
    isAuthenticated,
    isLoading: authLoading,
    checkAuth,
  } = useAdminStore();
  const [game, setGame] = useState<GameHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    async function fetchGame() {
      if (!gameId || !isAuthenticated) {
        if (!gameId) {
          setError("No game ID provided");
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/admin/games/${gameId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch game");
        const data = await res.json();
        setGame(data.game || data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load game");
      } finally {
        setLoading(false);
      }
    }
    fetchGame();
  }, [gameId, isAuthenticated]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-theme-panel flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-screen bg-theme-panel text-theme-foreground ">
        <main className="mx-auto w-full max-w-5xl p-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-theme-muted hover:text-theme-muted mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> <Trans>Go Back</Trans> </button>
          <div className="bg-red-100 text-red-700 p-4 rounded-xl">
            {error || "Game not found"}
          </div>
        </main>
      </div>
    );
  }

  return <ReplayContent game={game} />;
}

