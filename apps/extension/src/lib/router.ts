import { useLocation, useNavigate } from "react-router";

// Secrets (the recovery key, a generated password) reach the next screen through memory,
// never history.state, which the browser keeps across reloads and session restore.
// history.state only carries the id of the hand-off, so a plain link to the same path gets nothing.
let slot: { id: number; value: unknown } | undefined;
let nextId = 0;

export function useNavigateWithSecret() {
  const navigate = useNavigate();
  return (to: string, value: unknown) => {
    slot = { id: ++nextId, value };
    void navigate(to, { state: { secretId: slot.id } });
  };
}

export function useSecret<T>() {
  const state: unknown = useLocation().state;
  const id = (state as { secretId?: number } | null)?.secretId;
  return slot && id === slot.id ? (slot.value as T) : undefined;
}
