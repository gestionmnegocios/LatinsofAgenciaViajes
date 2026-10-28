"use client";

import { useSyncExternalStore } from "react";

/**
 * Reloj compartido para los semáforos de time-limit.
 *
 * Devuelve `null` en el servidor y en la hidratación (con Cache Components no
 * se puede leer la hora durante el prerender) y luego se actualiza cada 30 s.
 */
let current: number | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  current = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(tick, 30_000);
    queueMicrotask(tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
