// Vault store. Account and auth go through the server (/auth, /me); the cached account
// lets the vault unlock locally without a round trip. Items sync with /vault/items, and
// `itemsStore` is their encrypted offline cache.
// ponytail: settings are still local only (phase 3 of docs/extension_api_integration.md).
import { ApiError, api, refresh, tokenStore } from "@/lib/api";
import {
  createAccount,
  decryptItem,
  deriveMaster,
  type EncryptedItem,
  encryptItem,
  fromB64,
  type KdfParams,
  type MasterWrap,
  toB64,
  unwrapVaultKey,
  wrapMaster,
} from "@/lib/crypto";

export type Settings = {
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  generatorDefaults: { length: number; symbols: boolean; numbers: boolean };
};

export type Account = {
  /** 2 = registered on the server. Older local-only accounts are discarded on load. */
  v: 2;
  email: string;
  /** The recovery wrap stays on the server; reset fetches it. */
  keys: MasterWrap;
  settings: Settings;
  createdAt: string;
  updatedAt: string;
};

export type CredentialInput = {
  site: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  expiresAt: string | null;
};

/** What lives inside `ciphertext` (database design §5). */
type CredentialData = CredentialInput & {
  passwordChangedAt: string;
  createdAt: string;
};

export type Credential = CredentialData & { id: string; updatedAt: string };

/** One `vault_items` row, as the server returns it. */
type ServerItem = EncryptedItem & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

/** `synced` marks rows the server has; phase-1 builds wrote rows without it. */
export type StoredItem = ServerItem & { synced?: true };

type Session = { vaultKey: string; lastActiveAt: number };

export const DEFAULT_SETTINGS: Settings = {
  autoLockMinutes: 5,
  clipboardClearSeconds: 30,
  generatorDefaults: { length: 16, symbols: true, numbers: true },
};

export const accountStore = storage.defineItem<Account | null>(
  "local:account",
  { fallback: null }
);
export const itemsStore = storage.defineItem<StoredItem[]>("local:vaultItems", {
  fallback: [],
});
/** Whether the last server call for items failed; the UI then shows the cache read-only. */
export const syncStore = storage.defineItem<{ offline: boolean }>(
  "session:sync",
  { fallback: { offline: false } }
);
// storage.session is memory-only and shared by the popup and the app page.
export const sessionStore = storage.defineItem<Session | null>(
  "session:unlock",
  { fallback: null }
);

export const isIdle = (s: Session, a: Account) =>
  Date.now() - s.lastActiveAt > a.settings.autoLockMinutes * 60_000;

export type VaultState =
  | { status: "none"; account: null; items: []; vaultKey: null }
  | { status: "locked"; account: Account; items: []; vaultKey: null }
  | {
      status: "unlocked";
      account: Account;
      items: Credential[];
      vaultKey: Uint8Array<ArrayBuffer>;
    };

export async function loadVault(): Promise<VaultState> {
  const [account, session, stored] = await Promise.all([
    accountStore.getValue(),
    sessionStore.getValue(),
    itemsStore.getValue(),
  ]);
  if (account?.v !== 2) {
    if (account) await clearDevice();
    return { status: "none", account: null, items: [], vaultKey: null };
  }
  if (!session || isIdle(session, account)) {
    if (session) await sessionStore.removeValue();
    return { status: "locked", account, items: [], vaultKey: null };
  }
  const vaultKey = fromB64(session.vaultKey);
  const items = await Promise.all(
    stored.map(async (s) => ({
      ...(await decryptItem<CredentialData>(vaultKey, s)),
      id: s.id,
      updatedAt: s.updatedAt,
    }))
  );
  items.sort((a, b) => a.site.localeCompare(b.site));
  return { status: "unlocked", account, items, vaultKey };
}

const startSession = (vaultKey: Uint8Array) =>
  sessionStore.setValue({
    vaultKey: toB64(vaultKey),
    lastActiveAt: Date.now(),
  });

async function requireAccount() {
  const account = await accountStore.getValue();
  if (!account) throw new Error("No account on this device");
  return account;
}

const clearDevice = () =>
  Promise.all([
    accountStore.removeValue(),
    itemsStore.removeValue(),
    sessionStore.removeValue(),
    syncStore.removeValue(),
    tokenStore.removeValue(),
  ]);

type LoginResponse = MasterWrap & { accessToken: string };

async function serverLogin(email: string, authKey: string) {
  const res = await api<LoginResponse>("POST", "auth/login", {
    email,
    authKey,
    clientType: "EXTENSION",
  });
  await tokenStore.setValue(res.accessToken);
  return res;
}

async function saveAccount(email: string, keys: MasterWrap) {
  const now = new Date().toISOString();
  const prev = await accountStore.getValue();
  await accountStore.setValue({
    v: 2,
    email,
    keys,
    settings: prev?.email === email ? prev.settings : DEFAULT_SETTINGS,
    createdAt: prev?.email === email ? prev.createdAt : now,
    updatedAt: now,
  });
}

/** FR-1.1, FR-1.3. Registers, logs in, and returns the recovery key, shown once. */
export async function signup(email: string, master: string) {
  const { vaultKey, recoveryKey, authKey, keys } = await createAccount(master);
  await api("POST", "auth/register", { email, authKey, ...keys });
  await serverLogin(email, authKey);
  await itemsStore.setValue([]);
  // Session first, so the app never sees the account in a "locked" state.
  await startSession(vaultKey);
  await saveAccount(email, {
    kdfSalt: keys.kdfSalt,
    kdfParams: keys.kdfParams,
    wrappedVaultKeyMaster: keys.wrappedVaultKeyMaster,
    wrapIvMaster: keys.wrapIvMaster,
  });
  await syncStore.removeValue();
  return recoveryKey;
}

/** FR-1.2. Full login on a device with no (or another) account. */
export async function login(email: string, master: string) {
  const { kdfSalt, kdfParams } = await api<{
    kdfSalt: string;
    kdfParams: KdfParams;
  }>("POST", "auth/prelogin", { email });
  const { wrapKey, authKey } = await deriveMaster(master, kdfSalt, kdfParams);
  const res = await serverLogin(email, authKey);
  const keys: MasterWrap = {
    kdfSalt: res.kdfSalt,
    kdfParams: res.kdfParams,
    wrappedVaultKeyMaster: res.wrappedVaultKeyMaster,
    wrapIvMaster: res.wrapIvMaster,
  };
  const vaultKey = await unwrapVaultKey(wrapKey, keys);
  const prev = await accountStore.getValue();
  if (prev?.email !== email) await itemsStore.setValue([]);
  await startSession(vaultKey);
  await saveAccount(email, keys);
  await pullItems();
}

/**
 * FR-9.2. Unlocks from the cached master wrap, so it works offline, then renews the
 * server session in the background (refresh cookie first, else a fresh login).
 */
export async function unlock(master: string) {
  const account = await requireAccount();
  const { wrapKey, authKey } = await deriveMaster(
    master,
    account.keys.kdfSalt,
    account.keys.kdfParams
  );
  await startSession(await unwrapVaultKey(wrapKey, account.keys));
  // Pull after renewing, so it runs with a fresh token.
  void renewSession(account.email, authKey).then(pullItems);
}

async function renewSession(email: string, authKey: string) {
  try {
    if (!(await refresh(await tokenStore.getValue())))
      await serverLogin(email, authKey);
  } catch (e) {
    // 401: the master password changed elsewhere or the account is disabled; the
    // cached wrap is stale, so make the user log in again. Network errors: stay offline.
    if (e instanceof ApiError && e.status === 401) await clearDevice();
  }
}

/** Ends the server session and forgets this device's account. */
export async function logout() {
  await api("POST", "auth/logout").catch(() => {});
  await clearDevice();
}

export const lock = () => sessionStore.removeValue();

let lastTouch = 0;
/** Pushes the auto-lock deadline (FR-7.1); throttled to one write per 30 s. */
export async function touch() {
  if (Date.now() - lastTouch < 30_000) return;
  lastTouch = Date.now();
  const s = await sessionStore.getValue();
  if (s) await sessionStore.setValue({ ...s, lastActiveAt: lastTouch });
}

/** Pull and writes take this lock, so a pull can't overwrite a write that landed mid-GET. */
const withItemsLock = <T>(fn: () => Promise<T>) =>
  navigator.locks.request("padlock-items", fn);

const synced = (row: ServerItem): StoredItem => ({ ...row, synced: true });

/**
 * Replaces the cache with the server's items. Never throws: on failure it flags
 * `offline` and keeps the cache, so the vault stays readable.
 */
export function pullItems() {
  return withItemsLock(async () => {
    try {
      const server = await api<ServerItem[]>("GET", "vault/items");
      // ponytail: one-off upload of items made on the phase-1 build (local only, no
      // `synced`). Delete once no phase-1 installs are left.
      const local = (await itemsStore.getValue()).filter((i) => !i.synced);
      const uploaded = await Promise.all(
        local.map(({ ciphertext, iv, encVersion }) =>
          api<ServerItem>("POST", "vault/items", { ciphertext, iv, encVersion })
        )
      );
      await itemsStore.setValue([...server, ...uploaded].map(synced));
      await syncStore.setValue({ offline: false });
    } catch {
      await syncStore.setValue({ offline: true });
    }
  });
}

/** Encrypts and stores one credential on the server; returns its server id. */
export async function saveCredential(
  vaultKey: Uint8Array<ArrayBuffer>,
  input: CredentialInput,
  existing?: Credential
) {
  const now = new Date().toISOString();
  const createdAt = existing?.createdAt ?? now;
  const passwordChangedAt =
    existing && existing.password === input.password
      ? existing.passwordChangedAt
      : now;
  const data: CredentialData = { ...input, passwordChangedAt, createdAt };
  const body = await encryptItem(vaultKey, data);
  try {
    return await withItemsLock(async () => {
      const row = synced(
        existing
          ? await api<ServerItem>("PUT", `vault/items/${existing.id}`, body)
          : await api<ServerItem>("POST", "vault/items", body)
      );
      const items = await itemsStore.getValue();
      await itemsStore.setValue(
        existing
          ? items.map((i) => (i.id === row.id ? row : i))
          : [...items, row]
      );
      return row.id;
    });
  } catch (e) {
    // Deleted on another device: refresh the list so the UI drops it.
    if (e instanceof ApiError && e.status === 404) void pullItems();
    throw e;
  }
}

export function deleteCredential(id: string) {
  return withItemsLock(async () => {
    await api("DELETE", `vault/items/${id}`).catch((e: unknown) => {
      if (!(e instanceof ApiError && e.status === 404)) throw e; // already gone
    });
    const items = await itemsStore.getValue();
    await itemsStore.setValue(items.filter((i) => i.id !== id));
  });
}

// ponytail: the reset flow needs the server's emailed code (phase 4 of
// docs/extension_api_integration.md); a local-only reset would desync the server's auth key.
const RESET_PENDING = "Password reset isn't connected to the server yet.";

/** FR-1.5, FR-1.6. */
export function resetWithRecovery(_recoveryKey: string, _master: string) {
  return Promise.reject<string>(new Error(RESET_PENDING));
}

/** FR-1.7. */
export function resetAccount(_master: string) {
  return Promise.reject<string>(new Error(RESET_PENDING));
}

/**
 * FR-11.2: re-wraps the vault key under the new master. The server revokes every
 * session, so this logs straight back in with the new auth key.
 */
export async function changeMaster(current: string, next: string) {
  const account = await requireAccount();
  const cur = await deriveMaster(
    current,
    account.keys.kdfSalt,
    account.keys.kdfParams
  );
  const vaultKey = await unwrapVaultKey(cur.wrapKey, account.keys);
  const { wrap, authKey } = await wrapMaster(vaultKey, next);
  await api("PATCH", "me/master-password", {
    currentAuthKey: cur.authKey,
    authKey,
    ...wrap,
  });
  await tokenStore.removeValue();
  await serverLogin(account.email, authKey);
  await saveAccount(account.email, wrap);
}

export async function saveSettings(settings: Settings) {
  const account = await requireAccount();
  await accountStore.setValue({
    ...account,
    settings,
    updatedAt: new Date().toISOString(),
  });
}
