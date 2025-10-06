import { useCallback, useEffect, useRef } from "react";

export function useFlashOnChange<T extends HTMLElement>(
  value: unknown,
  duration = 1500,
  className = "badge-flash"
) {
  const nodeRef = useRef<T | null>(null);
  const prevValueRef = useRef(value);
  const timeoutRef = useRef<number | null>(null);
  const animationRef = useRef<Animation | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(timeoutRef.current);
      }
      animationRef.current?.cancel();
      animationRef.current = null;
    };
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) {
      prevValueRef.current = value;
      return;
    }

    const previous = prevValueRef.current;
    prevValueRef.current = value;

    if (previous === value) return;

    if (animationRef.current) {
      animationRef.current.cancel();
      animationRef.current = null;
    }

    if (typeof node.animate === "function") {
      const singleDuration = duration / 5;
      const originalBorderColor = node.style.borderColor;
      animationRef.current = node.animate(
        [
          {
            opacity: 1,
            boxShadow: "0 0 0 0 rgba(251, 191, 36, 0)",
            borderColor: originalBorderColor
          },
          {
            opacity: 0.3,
            boxShadow: "0 0 0 3px rgba(251, 191, 36, 0.9)",
            borderColor: "rgb(251, 191, 36)"
          },
          {
            opacity: 1,
            boxShadow: "0 0 0 0 rgba(251, 191, 36, 0)",
            borderColor: originalBorderColor
          }
        ],
        { duration: singleDuration, iterations: 5, easing: "ease-in-out" }
      );
      const resetStyles = () => {
        node.style.removeProperty("box-shadow");
        node.style.borderColor = originalBorderColor;
        node.style.removeProperty("opacity");
        animationRef.current = null;
      };
      animationRef.current.onfinish = resetStyles;
      animationRef.current.oncancel = resetStyles;
      return;
    }

    if (typeof window === "undefined") return;

    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      node.classList.remove(className);
      timeoutRef.current = null;
    }, duration);
  }, [value, duration, className]);

  const setNodeRef = useCallback((node: T | null) => {
    if (nodeRef.current && nodeRef.current !== node) {
      animationRef.current?.cancel();
      animationRef.current = null;
      if (timeoutRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
    nodeRef.current = node;
  }, []);

  return setNodeRef;
}
