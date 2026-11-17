import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { api } from "@/lib/api";
import { itemsStore, pullItems, type StoredItem, syncStore } from "@/lib/vault";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));

const row = (id: string, synced?: true): StoredItem => ({
  id,
  ciphertext: `ct-${id}`,
  iv: `iv-${id}`,
  encVersion: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...(synced && { synced }),
});

describe("pullItems", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.mocked(api).mockReset();
  });

  it("mirrors the server, uploading items made before sync existed", async () => {
    await itemsStore.setValue([row("phase1"), row("deleted-elsewhere", true)]);
    vi.mocked(api).mockImplementation((method, _path, body) => {
      if (method === "GET") return Promise.resolve([row("server")]);
      expect(body).toEqual({
        ciphertext: "ct-phase1",
        iv: "iv-phase1",
        encVersion: 1,
      });
      return Promise.resolve(row("uploaded"));
    });

    await pullItems();

    expect(await itemsStore.getValue()).toEqual([
      row("server", true),
      row("uploaded", true),
    ]);
    expect(await syncStore.getValue()).toEqual({ offline: false });
  });

  it("keeps the cache and flags offline when the server is unreachable", async () => {
    const cache = [row("a", true)];
    await itemsStore.setValue(cache);
    vi.mocked(api).mockRejectedValue(new TypeError("Failed to fetch"));

    await pullItems();

    expect(await itemsStore.getValue()).toEqual(cache);
    expect(await syncStore.getValue()).toEqual({ offline: true });
  });
});
