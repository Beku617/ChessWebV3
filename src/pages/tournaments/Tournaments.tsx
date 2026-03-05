import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

type TournamentType = "swiss" | "roundRobin" | "knockout";
type TournamentStatus = "draft" | "registering" | "running" | "finished";
type TabKey = "players" | "rounds" | "standings" | "bracket";

interface Summary {
  id: string;
  name: string;
  type: TournamentType;
  status: TournamentStatus;
  roundsPlanned: number;
  currentRound: number;
  timeControl: { baseMs: number; incMs: number; label?: string };
  ratingMin: number | null;
  ratingMax: number | null;
  registeredCount: number;
  canManage: boolean;
  isRegistered: boolean;
  createdBy: string;
  managerIds: string[];
}

interface PlayerRow {
  userId: string;
  name: string;
  rating: number;
  seed: number | null;
  score: number;
  buchholz: number;
  gamesPlayed: number;
}

interface GameRow {
  id: string;
  gameId: string;
  whiteId: string;
  blackId: string;
  whiteName: string;
  blackName: string;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  isBye: boolean;
  status: "pending" | "complete";
}

interface ManagerRow {
  userId: string;
  name: string;
  avatar: string;
  isOwner: boolean;
}

interface RoundRow {
  roundNumber: number;
  games: GameRow[];
}

interface StandingRow {
  rank: number;
  userId: string;
  name: string;
  score: number;
  buchholz: number;
  seed: number | null;
  gamesPlayed: number;
}

interface WinnerRow {
  rank: number;
  userId: string;
  name: string;
  avatar: string;
  score: number;
  buchholz: number;
  medal: "gold" | "silver" | "bronze";
}

interface Detail {
  tournament: Summary;
  players: PlayerRow[];
  rounds: RoundRow[];
  standings: StandingRow[];
  managers: ManagerRow[];
  winners?: WinnerRow[];
}

const typeLabel: Record<TournamentType, string> = {
  swiss: "Swiss",
  roundRobin: "Round-robin",
  knockout: "Knockout",
};

const medalLabel: Record<WinnerRow["medal"], string> = {
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
};

const medalEmoji: Record<WinnerRow["medal"], string> = {
  gold: "🥇",
  silver: "🥈",
  bronze: "🥉",
};

const medalBg: Record<WinnerRow["medal"], string> = {
  gold: "from-amber-50 to-white dark:from-amber-900/30 dark:to-gray-950",
  silver: "from-slate-50 to-white dark:from-slate-900/30 dark:to-gray-950",
  bronze: "from-orange-50 to-white dark:from-amber-900/25 dark:to-gray-950",
};

function timeControlLabel(value?: { baseMs: number; incMs: number; label?: string }) {
  if (!value) return "3+0";
  if (value.label) return value.label;
  return `${Math.round(value.baseMs / 60000)}+${Math.round(value.incMs / 1000)}`;
}

function rangeLabel(minRating: number | null, maxRating: number | null) {
  if (minRating === null && maxRating === null) return "Any";
  if (minRating !== null && maxRating !== null) return `${minRating}-${maxRating}`;
  if (minRating !== null) return `${minRating}+`;
  return `<= ${maxRating}`;
}

export default function Tournaments() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [list, setList] = useState<Summary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<TabKey>("players");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [type, setType] = useState<TournamentType>("swiss");
  const [minutes, setMinutes] = useState("3");
  const [increment, setIncrement] = useState("2");
  const [ratingMin, setRatingMin] = useState("");
  const [ratingMax, setRatingMax] = useState("");
  const [noRatingFilter, setNoRatingFilter] = useState(true);
  const [rounds, setRounds] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [showRepairEditor, setShowRepairEditor] = useState(false);
  const [repairText, setRepairText] = useState("");
  const [allowRepairRematch, setAllowRepairRematch] = useState(false);

  const loadList = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoadingList(true);
      const res = await fetch(`${API_URL}/api/tournaments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tournaments");
      const data = await res.json();
      const tournaments: Summary[] = data.tournaments || [];
      setList(tournaments);
      if (!selectedId && tournaments.length > 0) {
        setSelectedId(tournaments[0].id);
      }
      if (selectedId && !tournaments.some((t) => t.id === selectedId)) {
        setSelectedId(tournaments[0]?.id || "");
      }
      setError(null);
    } catch (err) {
      setError("Failed to load tournaments");
      setList([]);
    } finally {
      if (!opts?.silent) setLoadingList(false);
    }
  };

  const loadDetail = async (id: string, opts?: { silent?: boolean }) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      if (!opts?.silent) setLoadingDetail(true);
      const res = await fetch(`${API_URL}/api/tournaments/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load tournament detail");
      const data = await res.json();
      if (data?.tournament && data?.players && data?.rounds && data?.standings) {
        setDetail(data);
      }
      setError(null);
    } catch (err) {
      setError("Failed to load tournament detail");
      setDetail(null);
    } finally {
      if (!opts?.silent) setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId]);

  // Auto-refresh list and detail so players see newly started rounds without manual reload.
  useEffect(() => {
    const listInterval = setInterval(() => {
      void loadList({ silent: true });
    }, 15000);
    return () => clearInterval(listInterval);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const detailInterval = setInterval(() => {
      void loadDetail(selectedId, { silent: true });
    }, 5000);
    return () => clearInterval(detailInterval);
  }, [selectedId]);

  const runAction = async (
    key: string,
    request: () => Promise<Response>,
    fallbackError = "Failed to update tournament",
  ) => {
    try {
      setBusy(key);
      const res = await request();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || fallbackError);
      if (data?.tournament && data?.players && data?.rounds && data?.standings) {
        setDetail(data);
        setSelectedId(String(data.tournament.id));
      }
      await loadList();
      if (selectedId) await loadDetail(selectedId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackError);
    } finally {
      setBusy(null);
    }
  };

  const createTournament = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setBusy("create");
      const res = await fetch(`${API_URL}/api/tournaments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          timeControl: {
            baseMs: Math.max(1, Number(minutes) || 3) * 60_000,
            incMs: Math.max(0, Number(increment) || 0) * 1_000,
          },
          ratingMin: noRatingFilter ? null : ratingMin ? Number(ratingMin) : null,
          ratingMax: noRatingFilter ? null : ratingMax ? Number(ratingMax) : null,
          noRatingFilter,
          roundsPlanned: type === "swiss" && rounds ? Number(rounds) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to create tournament");
      setName("");
      setRatingMin("");
      setRatingMax("");
      const createdId = String(data?.tournament?.id || "");
      await loadList();
      if (createdId) setSelectedId(createdId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tournament");
    } finally {
      setBusy(null);
    }
  };

  const selectedSummary = list.find((item) => item.id === selectedId) || null;
  const currentUserId = String(user?.id || "");
  const isOwner =
    !!detail?.tournament?.createdBy &&
    detail.tournament.createdBy === currentUserId;
  const autoJoinGameIdRef = useRef<string>("");
  const myPendingGame = useMemo(() => {
    if (!detail || !currentUserId) return null;
    const round = detail.rounds.find(
      (r) => Number(r.roundNumber) === Number(detail.tournament.currentRound || 0),
    );
    if (!round) return null;
    return (
      round.games.find(
        (game) =>
          !game.isBye &&
          game.result === "*" &&
          (game.whiteId === currentUserId || game.blackId === currentUserId),
      ) || null
    );
  }, [currentUserId, detail]);
  const currentRoundGames = useMemo(() => {
    if (!detail) return [];
    const round = detail.rounds.find(
      (item) =>
        Number(item.roundNumber) === Number(detail.tournament.currentRound || 0),
    );
    return round?.games || [];
  }, [detail]);
  const canRepairCurrentRound = useMemo(() => {
    if (!detail?.tournament?.canManage) return false;
    if (detail.tournament.status !== "running") return false;
    if (currentRoundGames.length === 0) return false;
    return currentRoundGames.every((game) => game.status === "pending");
  }, [currentRoundGames, detail?.tournament?.canManage, detail?.tournament?.status]);

  useEffect(() => {
    if (canRepairCurrentRound) return;
    setShowRepairEditor(false);
  }, [canRepairCurrentRound, selectedId]);
  const managerIdsSet = useMemo(
    () => new Set((detail?.managers || []).map((manager) => manager.userId)),
    [detail?.managers],
  );
  const availableManagerCandidates = useMemo(() => {
    if (!detail) return [];
    return detail.players.filter((player) => {
      if (!player.userId) return false;
      if (player.userId === detail.tournament.createdBy) return false;
      return !managerIdsSet.has(player.userId);
    });
  }, [detail, managerIdsSet]);

  const register = async () => {
    if (!selectedId) return;
    await runAction("register", () =>
      fetch(`${API_URL}/api/tournaments/${selectedId}/register`, {
        method: "POST",
        credentials: "include",
      }),
    );
  };

  const unregister = async () => {
    if (!selectedId) return;
    await runAction("unregister", () =>
      fetch(`${API_URL}/api/tournaments/${selectedId}/unregister`, {
        method: "POST",
        credentials: "include",
      }),
    );
  };

  const start = async () => {
    if (!selectedId) return;
    await runAction("start", () =>
      fetch(`${API_URL}/api/tournaments/${selectedId}/start`, {
        method: "POST",
        credentials: "include",
      }),
    );
  };

  const pairNextRound = async () => {
    if (!detail?.tournament) return;
    const nextRound = Number(detail.tournament.currentRound || 0) + 1;
    await runAction("pair", () =>
      fetch(
        `${API_URL}/api/tournaments/${detail.tournament.id}/rounds/${nextRound}/pair`,
        {
          method: "POST",
          credentials: "include",
        },
      ),
    );
  };

  const finish = async () => {
    if (!selectedId) return;
    await runAction("finish", () =>
      fetch(`${API_URL}/api/tournaments/${selectedId}/stop`, {
        method: "POST",
        credentials: "include",
      }),
    );
  };

  const deleteTournament = async () => {
    if (!selectedId || !detail?.tournament) return;
    const confirmed = window.confirm(
      "This will permanently delete the tournament and all pairings. Continue?",
    );
    if (!confirmed) return;

    try {
      setBusy("delete");
      const res = await fetch(`${API_URL}/api/tournaments/${selectedId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete tournament");
      }
      await loadList();
      if (selectedId === detail.tournament.id) {
        setDetail(null);
      }
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete tournament",
      );
    } finally {
      setBusy(null);
    }
  };

  const addManager = async () => {
    if (!detail?.tournament?.id || !selectedManagerId) return;
    await runAction(
      "add-manager",
      () =>
        fetch(`${API_URL}/api/tournaments/${detail.tournament.id}/managers`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ managerId: selectedManagerId }),
        }),
      "Failed to add manager",
    );
    setSelectedManagerId("");
  };

  const removeManager = async (managerId: string) => {
    if (!detail?.tournament?.id || !managerId) return;
    await runAction(
      `remove-manager:${managerId}`,
      () =>
        fetch(
          `${API_URL}/api/tournaments/${detail.tournament.id}/managers/${managerId}`,
          {
            method: "DELETE",
            credentials: "include",
          },
        ),
      "Failed to remove manager",
    );
  };

  const reportResult = async (game: GameRow) => {
    if (!detail?.tournament) return;
    await runAction(`result:${game.gameId}`, () =>
      fetch(
        `${API_URL}/api/tournaments/${detail.tournament.id}/games/${game.gameId}/result`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result: results[game.gameId] || "1-0" }),
        },
      ),
    );
  };

  const openGame = (gameId: string) => {
    if (!gameId) return;
    const encodedGameId = encodeURIComponent(gameId);
    navigate(`/play/quick?tournamentGameId=${encodedGameId}`, {
      state: { tournamentGameId: gameId },
    });
  };

  const prepareRepairPayload = () => {
    if (!currentRoundGames.length) return;
    const pairings = currentRoundGames.map((game) =>
      game.isBye || !game.blackId
        ? { whiteId: game.whiteId }
        : { whiteId: game.whiteId, blackId: game.blackId },
    );
    setRepairText(
      JSON.stringify(
        { pairings, allowRematch: allowRepairRematch },
        null,
        2,
      ),
    );
    setShowRepairEditor(true);
  };

  const repairCurrentRound = async () => {
    if (!detail?.tournament) return;

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(repairText);
    } catch (err) {
      setError("Repair payload must be valid JSON");
      return;
    }

    const payload =
      parsedPayload && typeof parsedPayload === "object"
        ? (parsedPayload as Record<string, unknown>)
        : {};
    const pairings = Array.isArray(payload.pairings)
      ? payload.pairings
      : Array.isArray(parsedPayload)
        ? parsedPayload
        : null;

    if (!pairings) {
      setError("Repair payload must include a pairings array");
      return;
    }

    const allowRematch =
      payload.allowRematch === true || allowRepairRematch === true;

    await runAction(
      "repair-round",
      () =>
        fetch(
          `${API_URL}/api/tournaments/${detail.tournament.id}/rounds/${detail.tournament.currentRound}/repair`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pairings, allowRematch }),
          },
        ),
      "Failed to repair round",
    );
    setShowRepairEditor(false);
  };

  // Auto-join your current-round pairing as soon as it exists
  useEffect(() => {
    if (!detail || !currentUserId) return;
    if (detail.tournament.status !== "running") return;
    if (!myPendingGame) return;
    if (autoJoinGameIdRef.current === myPendingGame.gameId) return;

    autoJoinGameIdRef.current = myPendingGame.gameId;
    const encodedGameId = encodeURIComponent(myPendingGame.gameId);
    navigate(`/play/quick?tournamentGameId=${encodedGameId}`, {
      replace: false,
      state: { tournamentGameId: myPendingGame.gameId, autoStart: true },
    });
  }, [detail, currentUserId, myPendingGame, navigate]);

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Tournaments</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Create and manage Swiss, Round-robin, and Knockout events.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      <form
        onSubmit={createTournament}
        className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 grid grid-cols-1 md:grid-cols-12 gap-3"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tournament Name" className="md:col-span-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value as TournamentType)} className="md:col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm">
          <option value="swiss">Swiss</option>
          <option value="roundRobin">Round-robin</option>
          <option value="knockout">Knockout</option>
        </select>
        <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutes" className="md:col-span-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm" />
        <input type="number" min={0} value={increment} onChange={(e) => setIncrement(e.target.value)} placeholder="Inc" className="md:col-span-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm" />
        <input type="number" min={0} disabled={noRatingFilter} value={ratingMin} onChange={(e) => setRatingMin(e.target.value)} placeholder="Min Rating" className="md:col-span-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm disabled:opacity-50" />
        <input type="number" min={0} disabled={noRatingFilter} value={ratingMax} onChange={(e) => setRatingMax(e.target.value)} placeholder="Max Rating" className="md:col-span-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm disabled:opacity-50" />
        <label className="md:col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={noRatingFilter}
            onChange={(e) => {
              const checked = e.target.checked;
              setNoRatingFilter(checked);
              if (checked) {
                setRatingMin("");
                setRatingMax("");
              }
            }}
          />
          <span>No Rating Filter</span>
        </label>
        <input type="number" min={1} disabled={type !== "swiss"} value={rounds} onChange={(e) => setRounds(e.target.value)} placeholder="Swiss Rounds" className="md:col-span-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm disabled:opacity-50" />
        <button type="submit" disabled={busy === "create"} className="md:col-span-1 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2">
          {busy === "create" ? "Creating..." : "Create"}
        </button>
      </form>

      <section className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
        <aside className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 h-[68vh] overflow-y-auto">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 px-2 py-1">
            All Tournaments
          </h2>
          {loadingList ? (
            <div className="h-40 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 px-2 py-6">
              No tournaments yet.
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {list.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                    selectedId === item.id
                      ? "border-teal-500/50 bg-teal-500/10"
                      : "border-gray-200 dark:border-gray-800 hover:border-teal-500/30 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <div className="font-semibold text-sm truncate">{item.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {typeLabel[item.type]} • {timeControlLabel(item.timeControl)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {item.registeredCount} Registered
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 h-[68vh] overflow-hidden flex flex-col">
          {loadingDetail ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-7 h-7 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !detail || !selectedSummary ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              Select a tournament from the list.
            </div>
          ) : (
            <>
              <header className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <h3 className="text-xl font-bold">{detail.tournament.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {typeLabel[detail.tournament.type]} •{" "}
                      {timeControlLabel(detail.tournament.timeControl)} • Rating{" "}
                      {rangeLabel(detail.tournament.ratingMin, detail.tournament.ratingMax)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Round {detail.tournament.currentRound} / {detail.tournament.roundsPlanned}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.tournament.status === "running" && myPendingGame && (
                      <button
                        onClick={() => {
                          const encodedGameId = encodeURIComponent(myPendingGame.gameId);
                          navigate(`/play/quick?tournamentGameId=${encodedGameId}`, {
                            state: { tournamentGameId: myPendingGame.gameId, autoStart: true },
                          });
                        }}
                        className="rounded-lg px-3 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                      >
                        Go to My Board
                      </button>
                    )}
                    {detail.tournament.status === "registering" &&
                      (detail.tournament.isRegistered ? (
                        <button
                          onClick={unregister}
                          disabled={!!busy}
                          className="rounded-lg px-3 py-2 text-sm font-semibold border border-gray-300 dark:border-gray-700"
                        >
                          Unregister
                        </button>
                      ) : (
                        <button
                          onClick={register}
                          disabled={!!busy}
                          className="rounded-lg px-3 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
                        >
                          Register
                        </button>
                      ))}
                    {detail.tournament.canManage && detail.tournament.status === "registering" && (
                      <button
                        onClick={start}
                        disabled={!!busy}
                        className="rounded-lg px-3 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                      >
                        Start
                      </button>
                    )}
                    {detail.tournament.canManage && detail.tournament.status === "running" && (
                      <>
                        <button
                          onClick={prepareRepairPayload}
                          disabled={!!busy || !canRepairCurrentRound}
                          className="rounded-lg px-3 py-2 text-sm font-semibold border border-gray-300 dark:border-gray-700 disabled:opacity-50"
                        >
                          Repair Current Round
                        </button>
                        <button
                          onClick={pairNextRound}
                          disabled={!!busy}
                          className="rounded-lg px-3 py-2 text-sm font-semibold border border-gray-300 dark:border-gray-700"
                        >
                          Pair Next Round
                        </button>
                        <button
                          onClick={finish}
                          disabled={!!busy}
                          className="rounded-lg px-3 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
                        >
                          Stop Tournament
                        </button>
                      </>
                    )}
                    {isOwner && (
                      <button
                        onClick={deleteTournament}
                        disabled={!!busy || detail.tournament.status === "running"}
                        className="rounded-lg px-3 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
                      >
                        {busy === "delete" ? "Deleting..." : "Delete Tournament"}
                      </button>
                    )}
                  </div>
                </div>

                {detail.tournament.canManage && showRepairEditor && (
                  <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/30 px-3 py-3 space-y-2.5">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Repair Current Round Pairings (JSON)
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Edit pairings manually. Each player must appear exactly once.
                    </p>
                    <textarea
                      value={repairText}
                      onChange={(e) => setRepairText(e.target.value)}
                      rows={8}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-2 text-xs font-mono"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={allowRepairRematch}
                        onChange={(e) => setAllowRepairRematch(e.target.checked)}
                      />
                      Allow rematch pairings
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={repairCurrentRound}
                        disabled={!!busy}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
                      >
                        Apply Repair
                      </button>
                      <button
                        onClick={() => setShowRepairEditor(false)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border border-gray-300 dark:border-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {detail.winners && detail.winners.length > 0 && detail.tournament.currentRound > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {detail.winners.map((winner) => (
                      <div
                        key={winner.userId}
                        className={`rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br ${medalBg[winner.medal]} px-3 py-3 shadow-sm`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-300">
                          <span>
                            {medalEmoji[winner.medal]} {medalLabel[winner.medal]}
                          </span>
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            Rank {winner.rank}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-bold">{winner.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Score {winner.score}
                          {detail.tournament.type === "swiss" ? ` • Buchholz ${winner.buchholz}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detail.tournament.canManage && (
                  <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/30 px-3 py-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Managers
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {detail.managers.map((manager) => (
                        <div
                          key={manager.userId}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-2.5 py-1.5 text-xs"
                        >
                          <span className="font-semibold">{manager.name}</span>
                          {manager.isOwner && (
                            <span className="rounded-md bg-teal-500/20 text-teal-700 dark:text-teal-300 px-1.5 py-0.5">
                              Owner
                            </span>
                          )}
                          {isOwner && !manager.isOwner && (
                            <button
                              onClick={() => removeManager(manager.userId)}
                              disabled={!!busy}
                              className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      {detail.managers.length === 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          No managers assigned yet.
                        </span>
                      )}
                    </div>
                    {isOwner && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedManagerId}
                          onChange={(e) => setSelectedManagerId(e.target.value)}
                          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-xs min-w-[220px]"
                        >
                          <option value="">Select player to add as manager</option>
                          {availableManagerCandidates.map((candidate) => (
                            <option key={candidate.userId} value={candidate.userId}>
                              {candidate.name} ({candidate.rating})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={addManager}
                          disabled={
                            !!busy ||
                            !selectedManagerId ||
                            availableManagerCandidates.length === 0
                          }
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
                        >
                          Add Manager
                        </button>
                        {availableManagerCandidates.length === 0 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            No available players to add as manager.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </header>

              <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-2.5 flex gap-2">
                {(["players", "rounds", "standings", "bracket"] as TabKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      tab === key
                        ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    {key === "players"
                      ? "Players"
                      : key === "rounds"
                        ? "Rounds"
                        : key === "standings"
                          ? "Standings"
                          : "Bracket"}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {tab === "players" && (
                  <div className="space-y-2">
                    {detail.players.map((player) => (
                      <div
                        key={player.userId}
                        className="rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2.5 flex justify-between"
                      >
                        <div>
                          <div className="text-sm font-semibold">{player.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Rating {player.rating}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Seed {player.seed ?? "-"}
                        </div>
                      </div>
                    ))}
                    {detail.players.length === 0 && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">No players yet.</div>
                    )}
                  </div>
                )}

                {tab === "standings" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                          <th className="py-2 pr-3">Rank</th>
                          <th className="py-2 pr-3">Player</th>
                          <th className="py-2 pr-3">Score</th>
                          {detail.tournament.type === "swiss" && (
                            <th className="py-2 pr-3">Buchholz</th>
                          )}
                          <th className="py-2 pr-3">Seed</th>
                          <th className="py-2 pr-3">Games</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.standings.map((row) => (
                          <tr
                            key={row.userId}
                            className="border-b border-gray-100 dark:border-gray-800/60"
                          >
                            <td className="py-2 pr-3 font-semibold">{row.rank}</td>
                            <td className="py-2 pr-3">{row.name}</td>
                            <td className="py-2 pr-3">{row.score}</td>
                            {detail.tournament.type === "swiss" && (
                              <td className="py-2 pr-3">{row.buchholz}</td>
                            )}
                            <td className="py-2 pr-3">{row.seed ?? "-"}</td>
                            <td className="py-2 pr-3">{row.gamesPlayed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {tab === "rounds" && (
                  <div className="space-y-4">
                    {detail.rounds.map((round) => (
                      <section
                        key={round.roundNumber}
                        className="rounded-xl border border-gray-200 dark:border-gray-800"
                      >
                        <header className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 text-sm font-semibold">
                          Round {round.roundNumber}
                        </header>
                        <div className="divide-y divide-gray-200 dark:divide-gray-800">
                          {round.games.map((game) => (
                            <div
                              key={game.id}
                              className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                            >
                              <div className="text-sm">
                                <span className="font-semibold">{game.whiteName}</span>{" "}
                                <span className="text-gray-500 dark:text-gray-400">vs</span>{" "}
                                <span className="font-semibold">{game.blackName}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-700">
                                  {game.result === "*" ? "Pending" : game.result}
                                </span>
                                {detail.tournament.canManage &&
                                  game.status === "pending" &&
                                  !game.isBye && (
                                    <>
                                      <select
                                        value={results[game.gameId] || "1-0"}
                                        onChange={(e) =>
                                          setResults((prev) => ({
                                            ...prev,
                                            [game.gameId]: e.target.value,
                                          }))
                                        }
                                        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs"
                                      >
                                        <option value="1-0">1-0</option>
                                        <option value="0-1">0-1</option>
                                        <option value="1/2-1/2">1/2-1/2</option>
                                      </select>
                                      <button
                                        onClick={() => reportResult(game)}
                                        disabled={!!busy}
                                        className="rounded-lg px-2.5 py-1 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
                                      >
                                        Report Result
                                      </button>
                                    </>
                                  )}
                                {game.status === "pending" &&
                                  !game.isBye &&
                                  currentUserId &&
                                  (currentUserId === game.whiteId ||
                                    currentUserId === game.blackId) && (
                                    <button
                                      onClick={() => openGame(game.gameId)}
                                      className="rounded-lg px-2.5 py-1 text-xs font-semibold border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      Open Game
                                    </button>
                                  )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                    {detail.rounds.length === 0 && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        No rounds yet.
                      </div>
                    )}
                  </div>
                )}

                {tab === "bracket" && (
                  detail.tournament.type !== "knockout" ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      No bracket for this format.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="flex gap-3 min-w-max">
                        {detail.rounds.map((round) => (
                          <div
                            key={round.roundNumber}
                            className="w-64 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3"
                          >
                            <h4 className="text-sm font-semibold mb-2">
                              Round {round.roundNumber}
                            </h4>
                            <div className="space-y-2">
                              {round.games.map((game) => (
                                <div
                                  key={game.id}
                                  className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-2.5 py-2"
                                >
                                  <div className="text-xs font-semibold truncate">{game.whiteName}</div>
                                  <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                    {game.blackName}
                                  </div>
                                  <div className="text-[11px] text-teal-600 dark:text-teal-300 mt-1">
                                    {game.result === "*" ? "Pending" : game.result}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
