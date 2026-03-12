import { useEffect, useState } from "react";

const BLOCKING_MODAL_EVENT = "neongambit:blocking-modal-change";
const BLOCKING_MODAL_DATASET = "neongambitBlockingModal";

let activeBlockingModalCount = 0;
let previousHtmlOverflow = "";
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

function emitBlockingModalState() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BLOCKING_MODAL_EVENT, {
      detail: { open: activeBlockingModalCount > 0, count: activeBlockingModalCount },
    }),
  );
}

export function isBlockingModalOpen() {
  if (typeof document === "undefined") return false;
  return document.body?.dataset?.[BLOCKING_MODAL_DATASET] === "true";
}

export function acquireBlockingModalLock() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => {};
  }

  activeBlockingModalCount += 1;

  if (activeBlockingModalCount === 1) {
    const html = document.documentElement;
    const body = document.body;
    previousHtmlOverflow = html.style.overflow;
    previousBodyOverflow = body.style.overflow;
    previousBodyPaddingRight = body.style.paddingRight;

    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    body.dataset[BLOCKING_MODAL_DATASET] = "true";
  }

  emitBlockingModalState();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeBlockingModalCount = Math.max(0, activeBlockingModalCount - 1);

    if (activeBlockingModalCount === 0 && typeof document !== "undefined") {
      const html = document.documentElement;
      const body = document.body;
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      delete body.dataset[BLOCKING_MODAL_DATASET];
    }

    emitBlockingModalState();
  };
}

export function useBlockingModalLock(open: boolean) {
  useEffect(() => {
    if (!open) return undefined;
    return acquireBlockingModalLock();
  }, [open]);
}

export function useBlockingModalState() {
  const [open, setOpen] = useState(() => isBlockingModalOpen());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const sync = () => {
      setOpen(isBlockingModalOpen());
    };

    sync();
    window.addEventListener(BLOCKING_MODAL_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener(BLOCKING_MODAL_EVENT, sync as EventListener);
    };
  }, []);

  return open;
}
