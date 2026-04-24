import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import { Clock, Shuffle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import { BOARD_FRAME } from "../quickMatch/types";
import { useBoardTheme } from "../../hooks/useBoardTheme";

interface VariantOption {
  key: string;
  label: string;
  description: string;
}

const VARIANTS: VariantOption[] = [
  {
    key: "chess960",
    label: "Chess960",
    description: "Randomized back-rank pieces.",
  },
  {
    key: "kingOfHill",
    label: "King of the Hill",
    description: "Get your king to the center.",
  },
  {
    key: "threeCheck",
    label: "Three-Check",
    description: "Win by giving three checks.",
  },
  {
    key: "atomic",
    label: "Atomic Chess",
    description: "Captures explode nearby pieces and kings.",
  },
  {
    key: "fourPlayer",
    label: "4-Player Chess",
    description: "Online matchmaking on a 14x14 cross board.",
  },
];

const TIME_OPTIONS = [
  { label: "3+0", initial: 180, increment: 0 },
  { label: "5+0", initial: 300, increment: 0 },
  { label: "5+3", initial: 300, increment: 3 },
  { label: "10+0", initial: 600, increment: 0 },
  { label: "10+5", initial: 600, increment: 5 },
  { label: "15+10", initial: 900, increment: 10 },
];

function getTimeControlFromState(
  state: unknown,
): { initial: number; increment: number } | null {
  if (!state || typeof state !== "object") return null;
  const maybeState = state as { initial?: unknown; increment?: unknown };

  if (
    typeof maybeState.initial === "number" &&
    typeof maybeState.increment === "number"
  ) {
    return {
      initial: maybeState.initial,
      increment: maybeState.increment,
    };
  }

  return null;
}

function getTimeControlFromSearch(
  search: string,
): { initial: number; increment: number } | null {
  const params = new URLSearchParams(search);
  const initial = Number(params.get("initial"));
  const increment = Number(params.get("increment"));

  if (Number.isFinite(initial) && Number.isFinite(increment)) {
    return { initial, increment };
  }

  return null;
}

function getVariantFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  if (!("variant" in state)) return null;
  const value = String((state as { variant?: unknown }).variant || "");
  if (!value) return null;
  return value;
}

function getVariantFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("variant");
  if (!value) return null;
  return value;
}

function findVariantOption(value: string | null): VariantOption | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (
    VARIANTS.find((option) => option.key.toLowerCase() === normalized) || null
  );
}

function pickRandomSquare(indexes: number[]): number {
  const random = Math.floor(Math.random() * indexes.length);
  return indexes[random];
}

function createChess960PreviewFen(): string {
  const backRank = Array(8).fill("");
  const evenSquares = [0, 2, 4, 6];
  const oddSquares = [1, 3, 5, 7];

  const darkBishopSquare = pickRandomSquare(evenSquares);
  const lightBishopSquare = pickRandomSquare(oddSquares);
  backRank[darkBishopSquare] = "b";
  backRank[lightBishopSquare] = "b";

  const emptySquares: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    if (!backRank[i]) emptySquares.push(i);
  }

  const queenSquare = pickRandomSquare(emptySquares);
  backRank[queenSquare] = "q";

  const remainingAfterQueen = emptySquares.filter((idx) => idx !== queenSquare);
  const knightOneSquare = pickRandomSquare(remainingAfterQueen);
  backRank[knightOneSquare] = "n";

  const remainingAfterKnightOne = remainingAfterQueen.filter(
    (idx) => idx !== knightOneSquare,
  );
  const knightTwoSquare = pickRandomSquare(remainingAfterKnightOne);
  backRank[knightTwoSquare] = "n";

  const finalSquares = remainingAfterKnightOne
    .filter((idx) => idx !== knightTwoSquare)
    .sort((a, b) => a - b);
  backRank[finalSquares[0]] = "r";
  backRank[finalSquares[1]] = "k";
  backRank[finalSquares[2]] = "r";

  const rank = backRank.join("");
  return `${rank}/pppppppp/8/8/8/8/PPPPPPPP/${rank.toUpperCase()} w - - 0 1`;
}

function FourPlayerPreview({ size }: { size: number }) {
  const cells = [];
  for (let row = 0; row < 14; row += 1) {
    for (let col = 0; col < 14; col += 1) {
      const topCut = row < 3 && col < 3;
      const topRightCut = row < 3 && col > 10;
      const bottomLeftCut = row > 10 && col < 3;
      const bottomRightCut = row > 10 && col > 10;
      const playable = !(topCut || topRightCut || bottomLeftCut || bottomRightCut);
      cells.push(
        <div
          key={`${row}-${col}`}
          className={playable ? ((row + col) % 2 === 0 ? "bg-[#eeeed2]" : "bg-[#769656]") : "bg-transparent"}
        />,
      );
    }
  }

  return (
    <div
      className="theme-glass-panel-strong rounded-2xl overflow-hidden relative"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(14, minmax(0, 1fr))",
        }}
      >
        {cells}
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="px-3 py-1.5 rounded-full bg-black/55 text-white text-xs font-semibold uppercase tracking-wide">
          4-Player Board
        </span>
      </div>
    </div>
  );
}

export default function PlayVariants() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useBoardTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedVariant, setSelectedVariant] = useState(() => {
    return (
      findVariantOption(getVariantFromState(location.state)) ||
      findVariantOption(getVariantFromSearch(location.search)) ||
      VARIANTS[0]
    );
  });
  const [timeControl, setTimeControl] = useState(() => {
    return (
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search) || {
        initial: 300,
        increment: 0,
      }
    );
  });
  const [previewFen, setPreviewFen] = useState("start");

  // Responsive board width
  const [boardWidth, setBoardWidth] = useState(620);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = leftRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const padding = 6;
      const headerH = topBarRef.current?.offsetHeight ?? 36;
      const footerH = bottomBarRef.current?.offsetHeight ?? 32;
      const availableWidth = rect.width - padding - BOARD_FRAME;
      const availableHeight =
        Math.min(rect.height, window.innerHeight) - headerH - footerH - padding;
      const size = Math.floor(Math.min(availableWidth, availableHeight));
      setBoardWidth(Math.max(300, Math.min(size, 700)));
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    if (selectedVariant.key === "chess960") {
      setPreviewFen(createChess960PreviewFen());
      return;
    }
    setPreviewFen("start");
  }, [selectedVariant.key]);

  useEffect(() => {
    const selectedFromRoute =
      findVariantOption(getVariantFromState(location.state)) ||
      findVariantOption(getVariantFromSearch(location.search));
    if (selectedFromRoute) {
      setSelectedVariant(selectedFromRoute);
    }
  }, [location.state, location.search]);

  useEffect(() => {
    const selectedTimeControl =
      getTimeControlFromState(location.state) ||
      getTimeControlFromSearch(location.search);
    if (selectedTimeControl) {
      setTimeControl(selectedTimeControl);
    }
  }, [location.state, location.search]);

  const handleStart = () => {
    if (selectedVariant.key === "fourPlayer") {
      const params = new URLSearchParams({
        initial: String(timeControl.initial),
        increment: String(timeControl.increment),
        autostart: "1",
      });
      navigate(`/play/four-player?${params.toString()}`, {
        state: {
          initial: timeControl.initial,
          increment: timeControl.increment,
          autoStart: true,
        },
      });
      return;
    }

    const queueVariant =
      selectedVariant.key === "chess960"
        ? "chess960"
        : selectedVariant.key === "kingOfHill"
          ? "kingOfHill"
        : selectedVariant.key === "threeCheck"
          ? "threeCheck"
          : selectedVariant.key === "atomic"
            ? "atomic"
          : "standard";
    const params = new URLSearchParams({
      initial: String(timeControl.initial),
      increment: String(timeControl.increment),
      autostart: "1",
    });
    if (queueVariant !== "standard") {
      params.set("variant", queueVariant);
    }

    navigate(`/play/quick?${params.toString()}`, {
      state: {
        initial: timeControl.initial,
        increment: timeControl.increment,
        variant: queueVariant,
        autoStart: true,
      },
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full bg-transparent overflow-hidden"
    >
      <div className="h-full grid grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        {/* Left Side - Board Preview */}
        <div
          ref={leftRef}
          className="min-w-0 flex flex-col items-center justify-center p-2 gap-2 h-full"
        >
          {/* Top Variant Info Bar */}
          <div
            ref={topBarRef}
            className="w-full max-w-[900px] flex items-center gap-1.5 px-2"
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
              <div className="w-full h-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">V</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-900 dark:text-white text-[13px]">
                  {selectedVariant.label}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  ({t("Variant")})
                </span>
              </div>
            </div>
          </div>

          {/* Chess Board Preview */}
          {selectedVariant.key === "fourPlayer" ? (
            <FourPlayerPreview size={boardWidth} />
          ) : (
            <div
              className="theme-glass-panel-strong rounded-2xl overflow-hidden"
              style={{ width: boardWidth, height: boardWidth }}
            >
              <Chessboard
                boardWidth={boardWidth}
                position={previewFen}
                arePiecesDraggable={false}
                customSquareStyles={
                  selectedVariant.key === "kingOfHill"
                    ? {
                        d4: {
                          boxShadow:
                            "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)",
                        },
                        e4: {
                          boxShadow:
                            "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)",
                        },
                        d5: {
                          boxShadow:
                            "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)",
                        },
                        e5: {
                          boxShadow:
                            "inset 0 0 0 9999px rgba(250, 204, 21, 0.16)",
                        },
                      }
                    : undefined
                }
                customDarkSquareStyle={{
                  backgroundColor: colors.dark,
                  transition: "background-color 160ms ease",
                }}
                customLightSquareStyle={{
                  backgroundColor: colors.light,
                  transition: "background-color 160ms ease",
                }}
              />
            </div>
          )}

          {/* Bottom Player Info Bar */}
          <div
            ref={bottomBarRef}
            className="w-full max-w-[900px] flex items-center gap-1.5 px-2 justify-start"
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.fullName || t("You")}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {user?.fullName?.substring(0, 1).toUpperCase() || t("Y")}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <span className="font-semibold text-gray-900 dark:text-white text-[13px]">
                {user?.fullName || t("You")}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side - Variants Panel */}
        <div className="theme-glass-panel-strong min-w-0 w-full rounded-none border-l-0 flex flex-col h-full overflow-hidden">
          {/* Panel Header */}
          <div className="p-3 border-b border-theme-glass">
            <div className="flex items-center gap-2">
              <Shuffle className="w-4 h-4 text-brand-500" />
              <h2 className="font-bold text-[15px] text-gray-900 dark:text-white">
                {t("Chess Variants")}
              </h2>
            </div>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {t("Pick a ruleset and jump into a match.")}
            </p>
          </div>

          <div className="flex-1 flex flex-col gap-3 px-3 py-3 overflow-hidden min-h-0">
            {/* Variant Options */}
            <div className="theme-glass-panel-soft rounded-2xl p-3">
              <div className="text-[12px] font-semibold text-gray-900 dark:text-white mb-2">
                {t("Variants")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {VARIANTS.map((variant) => {
                  const isSelected = selectedVariant.key === variant.key;
                  return (
                    <button
                      key={variant.key}
                      onClick={() => setSelectedVariant(variant)}
                      className={`rounded-xl p-2.5 text-left transition-all border ${
                        isSelected
                          ? "bg-brand-500/10 border-brand-500 text-brand-600 dark:text-brand-400"
                          : "bg-white/55 dark:bg-white/10 border-white/10 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold">
                          {t(variant.label)}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        {t(variant.description)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Control */}
            <div className="theme-glass-panel-soft flex-1 min-h-0 rounded-2xl p-3 flex flex-col">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 dark:text-white mb-2">
                <Clock className="w-4 h-4 text-brand-500" />
                <span>{t("Time Control")}</span>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2 auto-rows-min">
                {TIME_OPTIONS.map((opt) => {
                  const isSelected =
                    timeControl.initial === opt.initial &&
                    timeControl.increment === opt.increment;
                  return (
                    <button
                      key={opt.label}
                      onClick={() =>
                        setTimeControl({
                          initial: opt.initial,
                          increment: opt.increment,
                        })
                      }
                      className={`py-2 px-3 rounded-xl text-center text-[13px] font-semibold transition-all ${
                        isSelected
                          ? "bg-brand-500 text-white ring-2 ring-brand-500"
                          : "bg-white/55 dark:bg-white/10 text-gray-700 dark:text-gray-300 ring-1 ring-white/10 hover:ring-white/20"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Play Button */}
          <div className="p-3 border-t border-theme-glass flex-shrink-0">
            <button
              onClick={handleStart}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-500 hover:from-brand-600 hover:to-brand-600 text-white font-bold text-[15px] transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
            >
              {t("Start Variant")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

