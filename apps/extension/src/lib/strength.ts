export type Level = 0 | 1 | 2 | 3 | 4;

export const MIN_MASTER_LENGTH = 12;

const CLASSES: [RegExp, number][] = [
  [/[a-z]/, 26],
  [/[A-Z]/, 26],
  [/\d/, 10],
  [/[^A-Za-z0-9]/, 13],
];

/** 0–100, from length × bits per character of the classes the password uses. */
export function score(pw: string) {
  const pool = CLASSES.reduce(
    (n, [re, size]) => (re.test(pw) ? n + size : n),
    0
  );
  if (!pool) return 0;
  return Math.min(100, Math.round(pw.length * Math.log2(pool) * 0.8));
}

export function level(s: number): Level {
  if (s === 0) return 0;
  return s < 40 ? 1 : s < 60 ? 2 : s < 85 ? 3 : 4;
}

export const LEVEL_LABELS = ["", "Weak", "Fair", "Strong", "Very strong"];

/** The sign-up meter: length first, then character variety. */
export function masterStrength(pw: string) {
  const kinds = CLASSES.filter(([re]) => re.test(pw)).length;
  const lvl: Level = !pw
    ? 0
    : pw.length < MIN_MASTER_LENGTH
      ? 1
      : kinds < 3
        ? 2
        : pw.length < 16
          ? 3
          : 4;
  const label = ["Enter a password", "Too short", "Fair", "Good", "Strong"][
    lvl
  ];
  return { level: lvl, label };
}

export const masterReady = (pw: string, confirm: string) =>
  pw.length >= MIN_MASTER_LENGTH && pw === confirm;
