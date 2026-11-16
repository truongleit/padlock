import { describe, expect, it } from "vitest";

import {
  createAccount,
  DEFAULT_KDF,
  decryptItem,
  deriveMaster,
  encryptItem,
  unwrapWithMaster,
  unwrapWithRecovery,
  wrapMaster,
} from "@/lib/crypto";

describe("vault crypto", () => {
  it("unwraps the vault key with the master password and the recovery key", async () => {
    const { vaultKey, recoveryKey, keys } =
      await createAccount("Maple!42-tiger");

    expect(recoveryKey).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(await unwrapWithMaster(keys, "Maple!42-tiger")).toEqual(vaultKey);
    expect(
      await unwrapWithRecovery(
        keys,
        recoveryKey.toLowerCase().replace(/-/g, " ")
      )
    ).toEqual(vaultKey);
  });

  it("rejects a wrong master password", async () => {
    const { keys } = await createAccount("right-password-123");
    await expect(
      unwrapWithMaster(keys, "wrong-password-123")
    ).rejects.toThrow();
  });

  it("re-wraps for a new master password without changing the vault key", async () => {
    const { vaultKey, keys } = await createAccount("old-password-123");
    const { wrap: rewrapped } = await wrapMaster(vaultKey, "new-password-456");

    expect(rewrapped.kdfSalt).not.toBe(keys.kdfSalt);
    expect(await unwrapWithMaster(rewrapped, "new-password-456")).toEqual(
      vaultKey
    );
  });

  it("derives a stable auth key that differs per password", async () => {
    const { authKey, keys } = await createAccount("auth-password-123");
    const again = await deriveMaster(
      "auth-password-123",
      keys.kdfSalt,
      keys.kdfParams
    );
    const other = await deriveMaster(
      "other-password-123",
      keys.kdfSalt,
      keys.kdfParams
    );

    expect(again.authKey).toBe(authKey);
    expect(other.authKey).not.toBe(authKey);
    expect(atob(authKey)).toHaveLength(32);
  });

  it("refuses weakened KDF parameters", async () => {
    await expect(
      deriveMaster("pw", "AAAA", { ...DEFAULT_KDF, iterations: 1 })
    ).rejects.toThrow("Unsupported KDF parameters");
  });

  it("round-trips an item with a fresh IV per write", async () => {
    const { vaultKey } = await createAccount("some-password-123");
    const data = { site: "github.com", password: "s3cret" };
    const a = await encryptItem(vaultKey, data);
    const b = await encryptItem(vaultKey, data);

    expect(a.iv).not.toBe(b.iv);
    expect(await decryptItem(vaultKey, a)).toEqual(data);
  });
});
