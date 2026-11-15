// Local vault store. Mirrors the server tables (users, user_settings, vault_items) so a
// sync API can take these records as-is.
// ponytail: no user endpoints exist yet (signup, login, vault sync, settings sync);
// everything lives in browser.storage until they do.
import {
  createAccount,
  decryptItem,
  type EncryptedItem,
  encryptItem,
  fromB64,
  type MasterWrap,
  type RecoveryWrap,
  toB64,
  unwrapWithMaster,
  unwrapWithRecovery,
  wrapMaster,
  wrapRecovery,
} from "@/lib/crypto";

export type Settings = {
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  generatorDefaults: { length: number; symbols: boolean; numbers: boolean };
};

export type Account = {
  email: string;
  keys: MasterWrap & RecoveryWrap;
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

type StoredItem = EncryptedItem & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

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
  if (!account) return { status: "none", account, items: [], vaultKey: null };
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

/** FR-1.1, FR-1.3. Returns the recovery key, shown once. */
export async function signup(email: string, master: string) {
  const { vaultKey, recoveryKey, keys } = await createAccount(master);
  const now = new Date().toISOString();
  await accountStore.setValue({
    email,
    keys,
    settings: DEFAULT_SETTINGS,
    createdAt: now,
    updatedAt: now,
  });
  await itemsStore.setValue([]);
  await startSession(vaultKey);
  return recoveryKey;
}

/** FR-9.2. Throws on a wrong master password. */
export async function unlock(master: string) {
  const account = await requireAccount();
  await startSession(await unwrapWithMaster(account.keys, master));
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
  const row: StoredItem = {
    id: existing?.id ?? crypto.randomUUID(),
    ...(await encryptItem(vaultKey, data)),
    createdAt,
    updatedAt: now,
  };
  const items = await itemsStore.getValue();
  await itemsStore.setValue(
    existing ? items.map((i) => (i.id === row.id ? row : i)) : [...items, row]
  );
  return row.id;
}

export async function deleteCredential(id: string) {
  const items = await itemsStore.getValue();
  await itemsStore.setValue(items.filter((i) => i.id !== id));
}

async function rekey(
  account: Account,
  vaultKey: Uint8Array<ArrayBuffer>,
  master: string
) {
  const { wrap, recoveryKey } = await wrapRecovery(vaultKey);
  await accountStore.setValue({
    ...account,
    keys: { ...(await wrapMaster(vaultKey, master)), ...wrap },
    updatedAt: new Date().toISOString(),
  });
  await startSession(vaultKey);
  return recoveryKey;
}

/** FR-1.5, FR-1.6: unwrap with the recovery key, set a new master, issue a new recovery key. */
export async function resetWithRecovery(recoveryKey: string, master: string) {
  const account = await requireAccount();
  return rekey(
    account,
    await unwrapWithRecovery(account.keys, recoveryKey),
    master
  );
}

/** FR-1.7: both secrets lost. Deletes every credential and starts a fresh vault. */
export async function resetAccount(master: string) {
  const account = await requireAccount();
  await itemsStore.setValue([]);
  return rekey(account, crypto.getRandomValues(new Uint8Array(32)), master);
}

/** FR-11.2: only the master wrap changes; items and the recovery key stay. */
export async function changeMaster(current: string, next: string) {
  const account = await requireAccount();
  const vaultKey = await unwrapWithMaster(account.keys, current);
  await accountStore.setValue({
    ...account,
    keys: { ...account.keys, ...(await wrapMaster(vaultKey, next)) },
    updatedAt: new Date().toISOString(),
  });
}

export async function saveSettings(settings: Settings) {
  const account = await requireAccount();
  await accountStore.setValue({
    ...account,
    settings,
    updatedAt: new Date().toISOString(),
  });
}
