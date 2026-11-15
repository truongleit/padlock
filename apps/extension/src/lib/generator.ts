import { score } from "@/lib/strength";

export type GeneratorOptions = {
  length: number;
  upper: boolean;
  lower: boolean;
  numbers: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
};

const SETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*-_+=?",
};

const pick = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0]! % n;

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export const hasCharset = (o: GeneratorOptions) =>
  o.upper || o.lower || o.numbers || o.symbols;

/** At least one character from every chosen set, then shuffled (FR-4.1, FR-4.4). */
export function randomPassword(o: GeneratorOptions) {
  const sets = (["upper", "lower", "numbers", "symbols"] as const)
    .filter((k) => o[k])
    .map((k) => (o.avoidAmbiguous ? SETS[k].replace(/[O0lI1]/g, "") : SETS[k]));
  const pool = sets.join("");
  const out = sets.map((s) => s[pick(s.length)]!);
  while (out.length < o.length) out.push(pool[pick(pool.length)]!);
  return shuffle(out).slice(0, o.length).join("");
}

export const INTERVIEW_QUESTIONS = [
  "Which place would you most like to visit?",
  "What food could you eat every week?",
  "Name an animal you like.",
  "What word always makes you smile?",
];

export const MIN_INTERVIEW_SCORE = 80;

/**
 * Answers mixed with random case, digits and separators, padded with random
 * characters until it meets the minimum score (FR-4.2, FR-4.3).
 * Answers never leave this function (NFR-SEC-12).
 */
export function interviewPassword(answers: string[]) {
  const words = answers
    .map((a) => a.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 12))
    .filter(Boolean)
    .map((w) => (pick(2) ? w[0]!.toUpperCase() + w.slice(1) : w.toLowerCase()));
  const parts = shuffle([...words, String(10 + pick(90))]);
  let pw =
    parts.map((p) => p + SETS.symbols[pick(SETS.symbols.length)]).join("") +
    pick(10);
  while (score(pw) < MIN_INTERVIEW_SCORE) {
    pw += randomPassword({
      length: 3,
      upper: true,
      lower: true,
      numbers: true,
      symbols: false,
      avoidAmbiguous: true,
    });
  }
  return pw;
}
