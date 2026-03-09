import { useSettingsStore } from "../store/settingsStore";

type MoveWithSoundHints = {
  from?: string | null;
  to?: string | null;
  san?: string | null;
  flags?: string | null;
  captured?: unknown;
  promotion?: string | null;
  castlingSide?: "k" | "q" | null;
  check?: boolean;
  isCheck?: boolean;
  checkmate?: boolean;
  isCheckmate?: boolean;
};

const SOUND_PATHS = {
  moveSelf: "/media/move-self.mp3",
  moveOpponent: "/media/move-opponent.mp3",
  check: "/media/move-check.mp3",
  checkmate: "/media/game-end.mp3",
  capture: "/media/capture.mp3",
  castle: "/media/castle.mp3",
  premove: "/media/premove.mp3",
  promote: "/media/promote.mp3",
  illegal: "/media/illegal.mp3",
  gameStart: "/media/game-start.mp3",
  gameEnd: "/media/game-end.mp3",
  tenSeconds: "/media/tenseconds.mp3",
  puzzleCorrect: "/media/puzzle-correct.mp3",
  puzzleWrong: "/media/puzzle-wrong.mp3",
} as const;

const audioCache: Partial<Record<keyof typeof SOUND_PATHS, HTMLAudioElement>> =
  {};
let prewarmed = false;
let lastTerminalSoundAt = 0;
let lastMoveSoundKey = "";
let lastMoveSoundAt = 0;
const MOVE_SOUND_DEDUPE_MS = 120;

function getAudio(name: keyof typeof SOUND_PATHS): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return null;
  }

  const cached = audioCache[name];
  if (cached) return cached;

  const audio = new Audio(SOUND_PATHS[name]);
  audio.preload = "auto";
  audioCache[name] = audio;
  return audio;
}

function prewarmAudio() {
  if (prewarmed || typeof window === "undefined") return;
  prewarmed = true;

  const names = Object.keys(SOUND_PATHS) as Array<keyof typeof SOUND_PATHS>;
  names.forEach((name) => {
    const audio = getAudio(name);
    audio?.load();
  });
}

if (typeof window !== "undefined") {
  const unlock = () => {
    prewarmAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function playSound(name: keyof typeof SOUND_PATHS) {
  const settings = useSettingsStore.getState().settings;
  if (!settings.soundEffects) return;

  const now = Date.now();
  if ((name === "checkmate" || name === "gameEnd") && now - lastTerminalSoundAt < 800) {
    return;
  }

  const audio = getAudio(name);
  if (!audio) return;

  try {
    audio.volume = Math.max(0, Math.min(1, settings.soundVolume / 100));
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Ignore autoplay-blocked cases and other playback failures.
    });
    if (name === "checkmate" || name === "gameEnd") {
      lastTerminalSoundAt = now;
    }
  } catch {
    // Ignore playback errors to keep gameplay smooth.
  }
}

export function isCastlingMove(move?: MoveWithSoundHints | null): boolean {
  if (!move) return false;

  if (move.castlingSide === "k" || move.castlingSide === "q") {
    return true;
  }

  const flags = typeof move.flags === "string" ? move.flags.toLowerCase() : "";
  if (flags.includes("k") || flags.includes("q")) {
    return true;
  }

  const san = typeof move.san === "string" ? move.san : "";
  return /^O-O(-O)?([+#])?$/.test(san);
}

export function isCaptureMove(move?: MoveWithSoundHints | null): boolean {
  if (!move) return false;

  const flags = typeof move.flags === "string" ? move.flags.toLowerCase() : "";
  if (flags.includes("c") || flags.includes("e")) {
    return true;
  }

  if (move.captured != null) {
    return true;
  }

  const san = typeof move.san === "string" ? move.san : "";
  return san.includes("x");
}

export function isCheckMove(move?: MoveWithSoundHints | null): boolean {
  if (!move) return false;
  if (move.check === true || move.isCheck === true) return true;

  const san = typeof move.san === "string" ? move.san.trim() : "";
  return san.endsWith("+") || san.includes("++");
}

export function isCheckmateMove(move?: MoveWithSoundHints | null): boolean {
  if (!move) return false;
  if (move.checkmate === true || move.isCheckmate === true) return true;

  const san = typeof move.san === "string" ? move.san : "";
  return san.includes("#");
}

export function isPromotionMove(move?: MoveWithSoundHints | null): boolean {
  if (!move) return false;

  if (typeof move.promotion === "string" && move.promotion.length > 0) {
    return true;
  }

  const flags = typeof move.flags === "string" ? move.flags.toLowerCase() : "";
  if (flags.includes("p")) {
    return true;
  }

  const san = typeof move.san === "string" ? move.san : "";
  return san.includes("=");
}

type MoveSoundOptions = {
  isOpponentMove?: boolean;
};

function resolveChessMoveSoundName(
  move?: MoveWithSoundHints | null,
  options: MoveSoundOptions = {},
): keyof typeof SOUND_PATHS {
  if (isCheckmateMove(move)) {
    return "checkmate";
  }

  if (isPromotionMove(move)) {
    return "promote";
  }

  if (isCastlingMove(move)) {
    return "castle";
  }

  if (isCheckMove(move)) {
    return "check";
  }

  if (isCaptureMove(move)) {
    return "capture";
  }

  return options.isOpponentMove ? "moveOpponent" : "moveSelf";
}

function getMoveSoundKey(
  soundName: keyof typeof SOUND_PATHS,
  move?: MoveWithSoundHints | null,
  options: MoveSoundOptions = {},
) {
  return [
    soundName,
    options.isOpponentMove ? "opp" : "self",
    move?.from ?? "",
    move?.to ?? "",
    move?.san ?? "",
    move?.flags ?? "",
    move?.promotion ?? "",
    move?.captured == null ? "" : String(move.captured),
    move?.castlingSide ?? "",
    move?.check === true || move?.isCheck === true ? "check" : "",
    move?.checkmate === true || move?.isCheckmate === true ? "mate" : "",
  ].join("|");
}

export function playChessMoveSound(
  move?: MoveWithSoundHints | null,
  options: MoveSoundOptions = {},
) {
  const soundName = resolveChessMoveSoundName(move, options);
  const dedupeKey = getMoveSoundKey(soundName, move, options);
  const now = Date.now();

  if (
    dedupeKey === lastMoveSoundKey &&
    now - lastMoveSoundAt < MOVE_SOUND_DEDUPE_MS
  ) {
    return;
  }

  lastMoveSoundKey = dedupeKey;
  lastMoveSoundAt = now;
  playSound(soundName);
}

type UiSoundName = "puzzleCorrect" | "puzzleWrong";

export function playUiSound(name: UiSoundName) {
  playSound(name);
}

type GameplaySoundName =
  | "premove"
  | "illegal"
  | "gameStart"
  | "gameEnd"
  | "tenSeconds";

export function playGameplaySound(name: GameplaySoundName) {
  playSound(name);
}
