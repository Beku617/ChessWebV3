import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { GameHistory } from "../../historyTypes";
import { useAdminStore } from "../../store/adminStore";
import AdminSidebar from "../../components/AdminSidebar";
import { API_URL } from "./types";
import { AdminReplayContent } from "./AdminReplayContent";

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
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white">
        <AdminSidebar />
        <main className="ml-72 p-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
          <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-xl">
            {error || "Game not found"}
          </div>
        </main>
      </div>
    );
  }

  return <AdminReplayContent game={game} />;
}

