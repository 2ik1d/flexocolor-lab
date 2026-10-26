import { useEffect, useState } from "react";
import { z } from "zod";

/** Small form fields only. Photos and measurements are stored in IndexedDB. */
export function useFormDraft<T>(
  key: string,
  schema: z.ZodType<T>,
  enabled: boolean,
) {
  const [restored] = useState(() => {
    if (!enabled) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return schema.parse(JSON.parse(raw));
    } catch {
      /* A stale draft must never prevent opening the application. */
    }
  });
  const [available, setAvailable] = useState(true);
  const save = (value: T) => {
    if (!enabled) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      setAvailable(false);
    }
  };
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Optional storage. */
    }
  };
  return { restored, save, clear, available };
}

export function useUnsavedWarning(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
}
