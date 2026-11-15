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
  sessionStore,
  touch,
  type VaultState,
} from "@/lib/vault";

type Vault = (
  | VaultState
  | { status: "loading"; account: null; items: []; vaultKey: null }
) & {
  settings: typeof DEFAULT_SETTINGS;
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
  });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = await loadVault();
      if (alive)
        setState({
          ...next,
          settings: next.account?.settings ?? DEFAULT_SETTINGS,
        });
    };
    load();
    const unwatch = [accountStore, itemsStore, sessionStore].map((s) =>
      s.watch(load)
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

  return <VaultContext value={state}>{children}</VaultContext>;
}
