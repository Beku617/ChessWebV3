import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GameHistory } from "../../historyTypes";
import { API_URL } from "./types";
import { ReplayContent } from "./ReplayContent";
import { isLikelyChess960Game } from "../../utils/chessVariantDetection";

export default function Analyze() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchGame() {
      if (!gameId) {
        setError(t("analysis.errors.noGameId"));
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/history/${gameId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(t("analysis.errors.fetchGame"));
        const data = await res.json();
        const loadedGame = (data.game || data) as GameHistory;
        if (isLikelyChess960Game(loadedGame)) {
          navigate(`/analyze960/${gameId}`, { replace: true });
          return;
        }
        setGame(loadedGame);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("analysis.errors.loadGame"));
      } finally {
        setLoading(false);
      }
    }
    fetchGame();
  }, [gameId, navigate, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-theme-primary">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-theme-primary text-theme-foreground">
        <h2 className="text-2xl font-bold mb-4">{t("analysis.gameNotFound")}</h2>
        <p className="text-theme-muted mb-6">
          {error || t("analysis.errors.unableToLoadGame")}
        </p>
        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500"
        >
          <ArrowLeft size={18} />
          {t("analysis.backToProfile")}
        </button>
      </div>
    );
  }

  return <ReplayContent game={game} />;
}

