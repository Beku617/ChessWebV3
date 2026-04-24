import { useCallback, useLayoutEffect, useState } from "react";

interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  const ref = useCallback((node: T | null) => {
    setElement(node);
    if (!node) {
      setSize((current) => {
        if (current.width === 0 && current.height === 0) {
          return current;
        }
        return { width: 0, height: 0 };
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!element) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const next = {
        width: Math.round(element.clientWidth),
        height: Math.round(element.clientHeight),
      };

      setSize((current) => {
        if (current.width === next.width && current.height === next.height) {
          return current;
        }
        return next;
      });
    };

    const scheduleMeasure = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleMeasure();
          })
        : null;

    observer?.observe(element);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [element]);

  return {
    ref,
    width: size.width,
    height: size.height,
    hasSize: size.width > 0 && size.height > 0,
  };
}
