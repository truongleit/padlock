// Client-side vault crypto (NFR-SEC-7, -9). Pure Web Crypto, so it runs in any page and in Node.
// Field names mirror the `users` / `vault_items` columns in docs/padlock_database_design.md.

export type KdfParams = { alg: "PBKDF2-SHA256"; iterations: number };

export type MasterWrap = {
  kdfSalt: string;
  kdfParams: KdfParams;
  wrappedVaultKeyMaster: string;
  wrapIvMaster: string;
};

export type RecoveryWrap = {
  wrappedVaultKeyRecovery: string;
  wrapIvRecovery: string;
};

export type EncryptedItem = { ciphertext: string; iv: string; encVersion: 1 };

// ponytail: PBKDF2 stands in for Argon2id (NFR-SEC-7); swap in hash-wasm argon2id behind `kdfParams.alg`.
export const DEFAULT_KDF: KdfParams = {
  alg: "PBKDF2-SHA256",
  iterations: 600_000,
};

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const fromB64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const aesKey = (raw: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

async function seal(key: CryptoKey, data: Uint8Array<ArrayBuffer>) {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { ciphertext: toB64(new Uint8Array(ct)), iv: toB64(iv) };
}

async function open(key: CryptoKey, ciphertext: string, iv: string) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) },
    key,
    fromB64(ciphertext)
  );
  return new Uint8Array(pt);
}

/**
 * One PBKDF2 run, split with HKDF (NFR-SEC-2): `wrapKey` wraps the vault key and never
 * leaves the device; `authKey` is what the server hashes to check a login.
 */
export async function deriveMaster(
  master: string,
  kdfSalt: string,
  p: KdfParams
) {
  // Trust boundary: prelogin params come from the server; refuse a weakened KDF.
  if (p.alg !== DEFAULT_KDF.alg || !(p.iterations >= DEFAULT_KDF.iterations))
    throw new Error("Unsupported KDF parameters");
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(master),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromB64(kdfSalt),
      iterations: p.iterations,
    },
    base,
    256
  );
  const hkdf = await crypto.subtle.importKey("raw", bits, "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
  const info = (label: string) => ({
    name: "HKDF",
    hash: "SHA-256",
    salt: new Uint8Array(),
    info: encoder.encode(label),
  });
  const wrapKey = await crypto.subtle.deriveKey(
    info("padlock-wrap"),
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  const auth = await crypto.subtle.deriveBits(info("padlock-auth"), hkdf, 256);
  return { wrapKey, authKey: toB64(new Uint8Array(auth)) };
}

function toBase32(bytes: Uint8Array) {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }
  return out;
}

function fromBase32(s: string) {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const c of s) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(out);
}

/** 160-bit key shown as 8 groups of 4, e.g. K7QX-9M2D-RT4W-... */
export const formatRecoveryKey = (raw: string) =>
  raw.match(/.{1,4}/g)?.join("-") ?? raw;

async function recoveryWrapKey(recoveryKey: string) {
  const chars = recoveryKey.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z2-7]{32}$/.test(chars)) throw new Error("Invalid recovery key");
  const digest = await crypto.subtle.digest("SHA-256", fromBase32(chars));
  return aesKey(new Uint8Array(digest));
}

export async function wrapMaster(
  vaultKey: Uint8Array<ArrayBuffer>,
  master: string
): Promise<{ wrap: MasterWrap; authKey: string }> {
  const kdfSalt = toB64(random(16));
  const { wrapKey, authKey } = await deriveMaster(master, kdfSalt, DEFAULT_KDF);
  const { ciphertext, iv } = await seal(wrapKey, vaultKey);
  const wrap: MasterWrap = {
    kdfSalt,
    kdfParams: DEFAULT_KDF,
    wrappedVaultKeyMaster: ciphertext,
    wrapIvMaster: iv,
  };
  return { wrap, authKey };
}

/** New recovery key + wrap. Called at sign-up and after every reset (FR-1.6). */
export async function wrapRecovery(vaultKey: Uint8Array<ArrayBuffer>) {
  const recoveryKey = formatRecoveryKey(toBase32(random(20)));
  const { ciphertext, iv } = await seal(
    await recoveryWrapKey(recoveryKey),
    vaultKey
  );
  const wrap: RecoveryWrap = {
    wrappedVaultKeyRecovery: ciphertext,
    wrapIvRecovery: iv,
  };
  return { wrap, recoveryKey };
}

export async function createAccount(master: string) {
  const vaultKey = random(32);
  const { wrap: recovery, recoveryKey } = await wrapRecovery(vaultKey);
  const { wrap, authKey } = await wrapMaster(vaultKey, master);
  return { vaultKey, recoveryKey, authKey, keys: { ...wrap, ...recovery } };
}

/** Throws when the master password is wrong (AES-GCM auth fails). */
export const unwrapVaultKey = (wrapKey: CryptoKey, w: MasterWrap) =>
  open(wrapKey, w.wrappedVaultKeyMaster, w.wrapIvMaster);

/** Throws when the master password is wrong (AES-GCM auth fails). */
export async function unwrapWithMaster(w: MasterWrap, master: string) {
  const { wrapKey } = await deriveMaster(master, w.kdfSalt, w.kdfParams);
  return unwrapVaultKey(wrapKey, w);
}

export async function unwrapWithRecovery(w: RecoveryWrap, recoveryKey: string) {
  return open(
    await recoveryWrapKey(recoveryKey),
    w.wrappedVaultKeyRecovery,
    w.wrapIvRecovery
  );
}

export async function encryptItem(
  vaultKey: Uint8Array<ArrayBuffer>,
  data: unknown
): Promise<EncryptedItem> {
  const sealed = await seal(
    await aesKey(vaultKey),
    encoder.encode(JSON.stringify(data))
  );
  return { ...sealed, encVersion: 1 };
}

export async function decryptItem<T>(
  vaultKey: Uint8Array<ArrayBuffer>,
  item: EncryptedItem
): Promise<T> {
  const pt = await open(await aesKey(vaultKey), item.ciphertext, item.iv);
  return JSON.parse(decoder.decode(pt)) as T;
}
