import { useCallback, useEffect, useRef } from "react";

export function useFlashOnChange<T extends HTMLElement>(
  value: unknown,
  duration = 1500,
  className = "flash-border"
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
      animationRef.current = node.animate(
        [
          { borderColor: "#ffffff", boxShadow: "0 0 0 0 rgba(255, 255, 255, 0)" },
          {
            borderColor: "#60a5fa",
            boxShadow: "0 0 0 3px rgba(255, 255, 255, 0.9), 0 0 10px 2px rgba(96, 165, 250, 0.85)"
          },
          { borderColor: "#ffffff", boxShadow: "0 0 0 0 rgba(255, 255, 255, 0)" }
        ],
        { duration: singleDuration, iterations: 5, easing: "ease-in-out" }
      );
      animationRef.current.onfinish = () => {
        node.style.removeProperty("box-shadow");
        node.style.removeProperty("border-color");
        animationRef.current = null;
      };
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
