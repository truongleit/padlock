// Password health, computed on the client after unlock (FR-5, FR-6, design decision 4).
import { score } from "@/lib/strength";
import type { Credential } from "@/lib/vault";

const DAY = 86_400_000;
export const EXPIRY_WARN_DAYS = 14;
export const OLD_MONTHS = 12;
export const WEAK_SCORE = 60;

export const daysUntil = (date: string) =>
  Math.ceil((Date.parse(date) - Date.now()) / DAY);
export const monthsSince = (date: string) =>
  Math.floor((Date.now() - Date.parse(date)) / (30.44 * DAY));

export const formatAge = (months: number) =>
  months < 1 ? "Under a month" : `${months} month${months === 1 ? "" : "s"}`;
export const formatDays = (days: number) =>
  `${days} day${days === 1 ? "" : "s"}`;
export const formatDate = (date: string) => new Date(date).toLocaleDateString();

export function analyze(items: Credential[]) {
  const byPassword = new Map<string, Credential[]>();
  for (const i of items) {
    byPassword.set(i.password, [...(byPassword.get(i.password) ?? []), i]);
  }
  const reusedGroups = [...byPassword.values()].filter((g) => g.length > 1);
  const reused = new Set(reusedGroups.flat().map((i) => i.id));
  const weak = items.filter((i) => score(i.password) < WEAK_SCORE);
  const old = items.filter(
    (i) => monthsSince(i.passwordChangedAt) >= OLD_MONTHS
  );
  const expiring = items
    .filter((i) => i.expiresAt && daysUntil(i.expiresAt) <= EXPIRY_WARN_DAYS)
    .sort((a, b) => Date.parse(a.expiresAt!) - Date.parse(b.expiresAt!));
  // A reused password counts as weak at most, however long it is.
  const total = items.reduce(
    (n, i) => n + Math.min(score(i.password), reused.has(i.id) ? 40 : 100),
    0
  );
  const overall = items.length ? Math.round(total / items.length) : 100;
  return { reusedGroups, reused, weak, old, expiring, score: overall };
}

export type ItemStatus = {
  tone: "success" | "warning" | "error";
  icon: "ok" | "alert" | "clock";
  label: string;
};

/** The single most urgent badge for a vault row. */
export function itemStatus(item: Credential, reused: Set<string>): ItemStatus {
  const days = item.expiresAt ? daysUntil(item.expiresAt) : null;
  if (days !== null && days < 0)
    return { tone: "error", icon: "clock", label: "Expired" };
  if (reused.has(item.id))
    return { tone: "error", icon: "alert", label: "Reused" };
  if (days !== null && days <= EXPIRY_WARN_DAYS)
    return {
      tone: "warning",
      icon: "clock",
      label: `Expires in ${formatDays(days)}`,
    };
  if (score(item.password) < WEAK_SCORE)
    return { tone: "error", icon: "alert", label: "Weak" };
  const age = monthsSince(item.passwordChangedAt);
  if (age >= OLD_MONTHS)
    return { tone: "warning", icon: "clock", label: `Old: ${formatAge(age)}` };
  return { tone: "success", icon: "ok", label: "Strong" };
}
