import { useSyncExternalStore } from "react";
const subscribe = (callback: () => void) => {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
};
// React rechecks the snapshot when subscribing, including changes during startup.
export function useHash() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "#orders",
  );
}
