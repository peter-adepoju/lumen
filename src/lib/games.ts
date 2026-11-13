// Games: quick, original play that still trains something. Pure functions.
import type { Card } from "./model";

export type Op = "+" | "−" | "×" | "÷";

/** Combines two numbers; only whole, positive results are allowed. */
export function combine(a: number, b: number, op: Op): number | null {
  if (op === "+") return a + b;
  if (op === "−") return a > b ? a - b : null;
  if (op === "×") return a * b;
  return b !== 0 && a % b === 0 ? a / b : null;
}

/**
 * A number round: six numbers and a target that is certainly reachable,
 * made by combining some of the numbers at random.
 */
export function numberRound(rnd: () => number = Math.random): { numbers: number[]; target: number } {
  const small = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], big = [25, 50, 75, 100];
  for (;;) {
    const bigs = 1 + Math.floor(rnd() * 2);
    const numbers = [...Array.from({ length: bigs }, () => big[Math.floor(rnd() * big.length)]), ...Array.from({ length: 6 - bigs }, () => small[Math.floor(rnd() * small.length)])];
    let pool = [...numbers];
    const steps = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < steps && pool.length > 1; i++) {
      const a = pool.splice(Math.floor(rnd() * pool.length), 1)[0], b = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const ops: Op[] = ["+", "−", "×", "÷"];
      const r = combine(Math.max(a, b), Math.min(a, b), ops[Math.floor(rnd() * 4)]) ?? a + b;
      pool.push(r);
    }
    const target = pool[pool.length - 1];
    if (target >= 101 && target <= 999 && !numbers.includes(target)) return { numbers: numbers.sort((x, y) => y - x), target };
    pool = [];
  }
}

/** Built-in pairs for when there are no flashcards yet: countries and capitals. */
export const CAPITALS: [string, string][] = [
  ["France", "Paris"], ["Japan", "Tokyo"], ["Kenya", "Nairobi"], ["Canada", "Ottawa"], ["Australia", "Canberra"], ["Brazil", "Brasília"],
  ["Nigeria", "Abuja"], ["Egypt", "Cairo"], ["Germany", "Berlin"], ["Spain", "Madrid"], ["India", "New Delhi"], ["Mexico", "Mexico City"],
  ["Ghana", "Accra"], ["Turkey", "Ankara"], ["Morocco", "Rabat"], ["Norway", "Oslo"], ["Peru", "Lima"], ["Vietnam", "Hanoi"],
];

export interface Tile { id: string; pair: string; text: string }

/** A pairs board: `n` pairs from the person's flashcards (short ones read best), or capitals. Shuffled. */
export function pairsBoard(cards: Card[], n = 6, rnd: () => number = Math.random): { tiles: Tile[]; from: "cards" | "capitals" } {
  const short = cards.filter(c => c.front.length <= 28 && c.back.split("\n")[0].length <= 28);
  const from = short.length >= n ? "cards" : "capitals";
  const src: [string, string][] = from === "cards" ? short.map(c => [c.front, c.back.split("\n")[0]]) : CAPITALS;
  const pool = shuffle([...src], rnd).slice(0, n);
  const tiles = pool.flatMap(([a, b], i) => [{ id: `${i}a`, pair: String(i), text: a }, { id: `${i}b`, pair: String(i), text: b }]);
  return { tiles: shuffle(tiles, rnd), from };
}

export function shuffle<T>(a: T[], rnd: () => number = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
