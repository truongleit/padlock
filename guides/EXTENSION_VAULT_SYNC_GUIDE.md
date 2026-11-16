# Padlock Extension: vault sync (phase 2, three people)

## Context

Phase 2 of `docs/extension_api_integration.md`. After phase 1 the extension logs in through the server, but saved credentials still live only in `browser.storage.local` (`local:vaultItems`). Log out or switch device and they are gone.

This phase makes the server the source of truth for credentials (SRS FR-2) through the existing `/vault/items` routes, and keeps the encrypted local copy so the vault still opens and autofills offline (read-only).

The backend is done (`apps/server/src/vault/`). Every route needs the user's Bearer token, which `api()` in `src/lib/api.ts` already adds and refreshes:

| Route | Body | Returns |
| --- | --- | --- |
| `GET /vault/items` | none | every item of the user |
| `POST /vault/items` | `{ ciphertext, iv, encVersion? }` | the stored item with its server `id` |
| `PUT /vault/items/:id` | same | the replaced item. **400** if `iv` equals the item's current IV |
| `DELETE /vault/items/:id` | none | 204. **404** if it isn't yours or is already gone |

An item is `{ id, ciphertext, iv, encVersion, createdAt, updatedAt }`, byte fields base64. The server can't read `ciphertext`: it is the AES-GCM sealed JSON of the credential (site, username, password, notes…), made by `encryptItem()` in `src/lib/crypto.ts`.

Scope (three people, three parts):
- **Part A (member 1):** the data layer in `src/lib/vault.ts`: pull, save, delete through the server, the offline flag, and the one-off upload of phase-1 items. Everyone else builds on it, so it goes first.
- **Part B (member 2):** when to pull (popup open, tab focus) and the offline note in the UI.
- **Part C (member 3):** error toasts on the three write screens, and the unit test for the pull.

Order: **A first. When A is merged, B and C start from `main` at the same time.** They touch different files, so they don't conflict.

Not in this guide: settings sync and change-master on `/me` (phase 3), password reset (phase 4), incremental sync with `since` (the server doesn't support it yet).

### Where the repo should be before you start

You already have:
- `src/lib/api.ts`: `api<T>(method, path, body?)` (JSON, Bearer token, one refresh-and-retry on 401, throws `ApiError { status, code, message }`), `errorText(e, fallback)` for user-facing messages.
- `src/lib/vault.ts`: `itemsStore` (the encrypted items in `local:vaultItems`), `saveCredential`, `deleteCredential`, `login`, `unlock`, `signup`, `clearDevice`.
- `src/components/VaultProvider.tsx`: reloads the decrypted vault whenever a watched storage item changes, in any extension page.
- `apps/extension/.env` with `WXT_API_URL` (copy `.env.example`; the team's dev API is `https://api.truongle.me`).

```bash
pnpm install
pnpm dev:extension
```
`pnpm dev:extension` opens Chrome with the extension loaded and reloads on save. Sign up or log in from the popup. Open the app page's DevTools (right-click → Inspect) and keep the **Network** tab open: every step below shows up there.

Rules of this repo apply: `@/` alias imports only, named exports, no `any`, `async` functions must `await` something, `pnpm typecheck && pnpm lint` before each commit. Type the code yourself so it sticks.

### Decisions already made

| Topic | Decision |
| --- | --- |
| Source of truth | The server. The local `itemsStore` is a cache of the server's rows, still encrypted |
| Sync style | Full list every time (`GET /vault/items`) and replace the cache. Items deleted on another device then disappear on their own |
| When to pull | After login, after unlock, when the popup opens, when the app tab becomes visible (at most once per 30 s) |
| Writes | Online only: `POST` / `PUT` / `DELETE` first, then update the cache with what the server returned. No offline queue |
| Item ids | The server's. `crypto.randomUUID()` goes away |
| Offline | Pull failure keeps the cache and sets `offline: true` in `session:sync`. The UI shows a note; writes still try and show an error toast if they fail. Buttons are **not** disabled |
| Races | Pull and writes run under one `navigator.locks` lock (`"padlock-items"`), so a slow pull can't overwrite a save that finished during it. Same idea as `refresh()` in `api.ts` |
| Phase-1 items | Cached rows without `synced: true` were made by the phase-1 build and exist only locally. The first pull uploads them once |
| Deleted elsewhere | `PUT` 404: pull, then show the error. `DELETE` 404: treat as done |

---

## Part A: data layer (`src/lib/vault.ts`)

Branch: `feat/extension-vault-sync-data`. Only `src/lib/vault.ts` changes.

### A1. Types and the offline flag

Split the stored row type in two: what the server returns, and what we cache (the same row plus a `synced` marker). Replace the old `StoredItem` type:

```ts
/** One `vault_items` row, as the server returns it. */
type ServerItem = EncryptedItem & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

/** `synced` marks rows the server has; phase-1 builds wrote rows without it. */
export type StoredItem = ServerItem & { synced?: true };
```

Next to `itemsStore`, add the offline flag. It lives in `storage.session` (memory only, shared by the popup, the app page and the background), like the unlock session:

```ts
/** Whether the last server call for items failed; the UI then shows the cache read-only. */
export const syncStore = storage.defineItem<{ offline: boolean }>(
  "session:sync",
  { fallback: { offline: false } }
);
```

Add `syncStore.removeValue()` to the `Promise.all` in `clearDevice`, so logging out resets it too.

### A2. The lock and `pullItems()`

Put this above `saveCredential`:

```ts
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
```

Why it's written this way:
- **Why a lock:** without it, a pull can start, a save can finish while the GET is in flight, and then the pull writes the old list over the new item. `navigator.locks` works across the popup, the app page and the background, because they share the extension's origin.
- **Why it never throws:** callers (B wires it into the UI) fire and forget. Failing means "show the cache, flag offline", never a crash.
- **Uploading phase-1 rows as-is:** `ciphertext` and `iv` go up unchanged. The server makes a **new** row, so reusing that IV is fine (IV reuse is only a problem on the same row, which `PUT` rejects).

### A3. Save and delete through the server

Replace `saveCredential` and `deleteCredential`:

```ts
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
```

Notes:
- `encryptItem()` makes a fresh random IV on every call, which is what `PUT` requires. Never reuse `existing`'s ciphertext/iv for an edit.
- Encrypt **outside** the lock. It's the slow part, and nothing else needs to wait for it.
- `saveCredential` now **throws** on network or server errors. Part C catches that in the pages.

### A4. Pull at login, unlock and sign-up

- `login`: add `await pullItems();` as the last line (after `saveAccount`).
- `unlock`: replace `void renewSession(account.email, authKey);` with
  ```ts
  // Pull after renewing, so it runs with a fresh token.
  void renewSession(account.email, authKey).then(pullItems);
  ```
  Unlock itself stays local and instant (it works offline); the pull follows in the background.
- `signup`: the new account has no items, so no pull. Just add `await syncStore.removeValue();` before `return recoveryKey;` so a stale offline flag from a previous account is gone.

Update the comment at the top of the file: items now sync with `/vault/items` and `itemsStore` is the offline cache; only settings are still local (phase 3).

### Check

The UI doesn't pull on popup open yet (that's B), but login and unlock do.
- Log in. Network shows `GET vault/items` → 200.
- Add a credential. `POST vault/items` → 201, and the detail page opens on an id that matches the response.
- Edit it: `PUT vault/items/<id>` → 200. Delete it: `DELETE` → 204, and it leaves the list.
- Log out, log in again: your credentials come back (they used to be lost).
- If you have items from the phase-1 build: after the first login they are `POST`ed once. A second login doesn't upload them again.

### Finish Part A

Run `pnpm typecheck && pnpm lint` first.

- Branch: `feat/extension-vault-sync-data`
- Commit: `feat(extension): sync vault items with the server`

---

## Part B: pull triggers and the offline note

Start from `main` with Part A merged. Branch: `feat/extension-vault-sync-ui`. Files: `src/components/VaultProvider.tsx`, `src/components/AppLayout.tsx`, `src/entrypoints/popup/App.tsx`.

### B1. Expose `offline` and pull on open/focus (`VaultProvider.tsx`)

1. Import `pullItems` and `syncStore` from `@/lib/vault` (Biome sorts the list).
2. Add the flag to the context type, under `settings`:
   ```ts
   /** Last items sync failed: the cache is shown read-only. */
   offline: boolean;
   ```
   and `offline: false` to the initial `useState` value.
3. In `load()`, read the flag next to the vault, and watch `syncStore` too, so every page updates when any page's pull fails or recovers:
   ```ts
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
   ```
   ```ts
   const unwatch = [accountStore, itemsStore, sessionStore, syncStore].map(
     (s) => s.watch(load)
   );
   ```
4. Add a third effect, before the `return`:
   ```tsx
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
   ```
   The popup is a fresh page each time it opens, so `pull()` on mount gives it a fresh list. The app page stays open in a tab, so it also pulls when you come back to it. The 30 s throttle stops tab-flipping from spamming the server. `pullItems()` changes `itemsStore`, the watcher calls `load()`, and the list re-renders on its own.

### B2. The note (`AppLayout.tsx`)

Import `Note` from `@/components/ui/note` and `useVault` from `@/components/VaultProvider`. Add, above `BackLink`:

```tsx
/** Shown while the last items sync failed (popup and app). */
export function OfflineNote({ className }: { className?: string }) {
  if (!useVault().offline) return null;
  return (
    <Note className={className} role="status" tone="warn">
      <p>Offline: showing your saved copy. Changes need a connection.</p>
    </Note>
  );
}
```

and render it at the top of `<main>`, so every unlocked page gets it:

```tsx
        <OfflineNote className="mb-6" />
        {children}
```

### B3. The popup (`popup/App.tsx`)

Import `OfflineNote` from `@/components/AppLayout` and put `<OfflineNote />` as the first child of the fragment returned by `Unlocked`, above the "matches" section.

### Check

- Open the popup: Network (Inspect the popup) shows `GET vault/items` each time.
- App tab: switch to another tab and back. One `GET` per return, no more than one per 30 s.
- Two Chrome profiles logged into the same account: delete an item in one, come back to the app tab in the other. It disappears.
- DevTools → Network → throttling **Offline**, then switch tabs and back: the yellow note appears in the app; open the popup, it shows there too. Credentials are still listed. Go back **No throttling**, switch tabs again (after 30 s): the note goes away.

### Finish Part B

Run `pnpm typecheck && pnpm lint` first.

- Branch: `feat/extension-vault-sync-ui`
- Commit: `feat(extension): pull vault items on open and show offline state`

---

## Part C: write errors and the pull test

Start from `main` with Part A merged. Branch: `feat/extension-vault-sync-errors`. Files: `CredentialFormPage.tsx`, `RotatePasswordPage.tsx`, `CredentialDetailPage.tsx` (all in `src/entrypoints/app/pages/`), and a new `src/lib/vault.spec.ts`.

Since Part A, `saveCredential` and `deleteCredential` throw when the server can't be reached or says no. Today the pages don't catch it: the button stays on "Saving…" forever and nothing tells the user why.

### C1. Catch and toast in the three pages

Each page needs `import { errorText } from "@/lib/api";` and `toast` from `sonner` (two of them already import it; add it to `CredentialFormPage`).

`CredentialFormPage.tsx`, in `onSubmit`:
```tsx
    setBusy(true);
    try {
      const id = await saveCredential(vaultKey, form, existing);
      void navigate(`/vault/${id}`);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save. Try again."));
      setBusy(false);
    }
```

`RotatePasswordPage.tsx`, in `onSave`, wrap the save and keep the success path after it:
```tsx
    try {
      await saveCredential(vaultKey, { ...item, password, expiresAt }, item);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save. Try again."));
      setBusy(false);
      return;
    }
    toast.success(`Password for ${item.site} changed.`);
    void navigate(`/vault/${item.id}`);
```

`CredentialDetailPage.tsx`, in `onDelete`:
```tsx
    try {
      await deleteCredential(item.id);
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete. Try again."));
      return;
    }
    toast.success(`${item.site} deleted.`);
    void navigate("/vault");
```

`errorText` shows the server's message for a 4xx/5xx, and "Can't reach the PadLock server…" when `fetch` itself failed. On failure the form keeps what the user typed.

### C2. Unit test for `pullItems()` (`src/lib/vault.spec.ts`)

The `WxtVitest` plugin (`vitest.config.ts`) gives tests a fake `browser.storage`, so `itemsStore` and `syncStore` work as-is. We mock only `api`, so no server is needed. `navigator.locks` exists in Node 25.

```ts
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
```

What it proves: the phase-1 row is uploaded with its ciphertext untouched, the row deleted on another device is dropped, everything cached afterwards is `synced`, and a network failure never wipes the cache. The mock returns `Promise.resolve(...)` instead of being `async`, because Biome's `useAwait` rejects an `async` function with no `await`.

### Check

- `pnpm --filter extension test`: 8 tests pass (6 crypto + 2 new).
- Break it on purpose once: in `pullItems`, delete `.filter((i) => !i.synced)`. The first test should fail (the item deleted elsewhere gets uploaded again), the offline one still passes. Undo it.
- In the app, DevTools → Network → **Offline**. Add a credential: a red toast "Can't reach the PadLock server…", the form keeps your input, the button works again. Same for Rotate and Delete.
- Back online, save again: it works.

### Finish Part C

Run `pnpm typecheck && pnpm lint && pnpm test` first.

- Branch: `feat/extension-vault-sync-errors`
- Commit: `feat(extension): show vault write errors and test the pull`

---

## When all three are merged

One person runs the whole flow against the dev API, from a fresh build (`pnpm --filter extension build`, load `.output/chrome-mv3`):

1. Add, edit, rotate and delete credentials. Each request is 2xx in Network.
2. A second Chrome profile, same account: after login it shows the same items.
3. Delete in profile A, return to the app tab in profile B: the item disappears.
4. Network **Offline**: the vault still unlocks and lists items, the note shows in the app and the popup, saving shows the error toast. Back online: the note clears on the next pull.
5. Popup autofill still works with the synced items.

Then tick phase 2 in `docs/extension_api_integration.md` and update the extension line in `CLAUDE.md` (items sync via `/vault/items`; only settings remain local).
