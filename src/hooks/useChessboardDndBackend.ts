import { useMemo } from "react";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";

function shouldUseTouchBackend() {
  if (typeof window === "undefined") return false;

  const hasFinePrimaryPointer =
    window.matchMedia?.("(pointer: fine)").matches ?? false;
  if (hasFinePrimaryPointer) {
    return false;
  }

  const hasCoarsePrimaryPointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const touchPoints =
    typeof navigator !== "undefined" ? Number(navigator.maxTouchPoints || 0) : 0;

  return hasCoarsePrimaryPointer || touchPoints > 0;
}

export function useChessboardDndBackend() {
  const useTouchBackend = shouldUseTouchBackend();

  return useMemo(
    () =>
      useTouchBackend
        ? {
            customDndBackend: TouchBackend,
            customDndBackendOptions: { enableMouseEvents: true },
          }
        : {
            customDndBackend: HTML5Backend,
            customDndBackendOptions: undefined,
          },
    [useTouchBackend],
  );
}
