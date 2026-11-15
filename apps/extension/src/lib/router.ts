import { useEffect, useSyncExternalStore } from "react";

// ponytail: hash routing + one module slot for passing secrets between screens
// (kept out of the URL and history). Swap for a router if routes grow.
let state: unknown;

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export const useHashPath = () =>
  useSyncExternalStore(subscribe, () => location.hash.slice(1) || "/");

export function navigate(to: string, routeState?: unknown) {
  state = routeState;
  location.hash = to;
}

export const routeState = <T>() => state as T | undefined;

export function useRedirect(when: boolean, to: string) {
  useEffect(() => {
    if (when) navigate(to);
  }, [when, to]);
}
