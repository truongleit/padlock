import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  accountStore,
  DEFAULT_SETTINGS,
  itemsStore,
  loadVault,
  pullItems,
  sessionStore,
  syncStore,
  touch,
  type VaultState,
} from "@/lib/vault";

type Vault = (
  | VaultState
  | { status: "loading"; account: null; items: []; vaultKey: null }
) & {
  settings: typeof DEFAULT_SETTINGS;
  /** Last items sync failed: the cache is shown read-only. */
  offline: boolean;
};

const VaultContext = createContext<Vault | null>(null);

export function useVault() {
  const vault = useContext(VaultContext);
  if (!vault) throw new Error("useVault needs a VaultProvider");
  return vault;
}

/** Decrypted vault state, reloaded whenever another page (popup, app, background) writes. */
export function VaultProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Vault>({
    status: "loading",
    account: null,
    items: [],
    vaultKey: null,
    settings: DEFAULT_SETTINGS,
    offline: false,
  });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [next, sync] = await Promise.all([
        loadVault(),
        syncStore.getValue(),
      ]);
      if (alive)
        setState({
          ...next,
          settings: next.account?.settings ?? DEFAULT_SETTINGS,
          offline: sync.offline,
        });
    };
    load();
    const unwatch = [accountStore, itemsStore, sessionStore, syncStore].map(
      (s) => s.watch(load)
    );
    return () => {
      alive = false;
      for (const u of unwatch) u();
    };
  }, []);

  const unlocked = state.status === "unlocked";
  useEffect(() => {
    if (!unlocked) return;
    const onActivity = () => void touch();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [unlocked]);

  // Fresh items when the popup opens or the app tab comes back into view.
  useEffect(() => {
    if (!unlocked) return;
    let lastPull = 0;
    const pull = () => {
      if (document.hidden || Date.now() - lastPull < 30_000) return;
      lastPull = Date.now();
      void pullItems();
    };
    pull();
    document.addEventListener("visibilitychange", pull);
    return () => document.removeEventListener("visibilitychange", pull);
  }, [unlocked]);

  return <VaultContext value={state}>{children}</VaultContext>;
}
