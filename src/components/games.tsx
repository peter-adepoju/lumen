"use client";
import { useState } from "react";
import { combine, numberRound, pairsBoard, type Op, type Tile } from "@/lib/games";
import { addLumens } from "@/lib/stats";
import { today } from "@/lib/recs";
import { store, useStore } from "@/lib/store/store";
import { Button, Card, cn } from "./ui";

async function won(kind: "pairs" | "target", score: number, lumens: number) {
  const at = Date.now();
  await store.update("games", g => [...(g ?? []), { kind, score, day: today(), at }].slice(-500));
  await store.update("stats", s => addLumens(s, lumens));
}

/* ---------------- Pairs ---------------- */
export function Pairs() {
  const s = useStore();
  const cards = s.get("cards") ?? [];
  const [board, setBoard] = useState<ReturnType<typeof pairsBoard> | null>(null);
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const best = (s.get("games") ?? []).filter(g => g.kind === "pairs").reduce((m, g) => Math.min(m, g.score), Infinity);

  function start() { setBoard(pairsBoard(cards, 6)); setOpen([]); setMatched([]); setMoves(0); }
  function flip(t: Tile) {
    if (!board || matched.includes(t.pair) || open.includes(t.id) || open.length === 2) return;
    const next = [...open, t.id];
    setOpen(next);
    if (next.length < 2) return;
    setMoves(m => m + 1);
    const [a, b] = next.map(id => board.tiles.find(x => x.id === id)!);
    if (a.pair === b.pair) {
      const all = [...matched, a.pair];
      setMatched(all); setOpen([]);
      if (all.length === board.tiles.length / 2) void won("pairs", moves + 1, 15);
    } else setTimeout(() => setOpen([]), 900);
  }
  const done = board && matched.length === board.tiles.length / 2;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between"><p className="font-medium">Pairs</p><span className="text-[12px] text-muted">Memory · {board?.from === "cards" ? "your flashcards" : "countries and capitals"}</span></div>
      {!board ? (
        <>
          <p className="text-[13.5px] text-muted">Turn over two tiles at a time and match each word with its meaning. {cards.length >= 6 ? "Built from your own flashcards." : "Make a few flashcards in Practice and Pairs uses them."}</p>
          <Button className="self-start" onClick={start}>Play</Button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {board.tiles.map(t => {
              const up = open.includes(t.id) || matched.includes(t.pair);
              return (
                <button key={t.id} onClick={() => flip(t)} aria-label={up ? t.text : "Hidden tile"}
                  className={cn("grid min-h-[64px] place-items-center rounded-[10px] border px-1.5 text-center text-[13px] leading-tight transition", matched.includes(t.pair) ? "border-gold bg-[var(--gold-soft)]" : up ? "border-fg bg-surface" : "border-border bg-surface-2 hover:border-gold")}>
                  {up ? t.text : <span className="orb size-3 opacity-60" aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted" role="status">{done ? `Cleared in ${moves} moves. +15 lumens.` : `${moves} moves`}{Number.isFinite(best) ? ` · best ${best}` : ""}</span>
            <Button size="sm" variant="ghost" className="shrink-0 whitespace-nowrap" onClick={start}>{done ? "Play again" : "New board"}</Button>
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------------- Target ---------------- */
interface Num { id: number; v: number }
export function Target() {
  const [round, setRound] = useState<{ target: number; start: Num[] } | null>(null);
  const [nums, setNums] = useState<Num[]>([]);
  const [history, setHistory] = useState<Num[][]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  function start() {
    const r = numberRound(), start = r.numbers.map((v, i) => ({ id: i, v }));
    setRound({ target: r.target, start }); setNums(start); setHistory([]); setSel(null); setOp(null); setSteps([]); setMsg(null); setSolved(false);
  }
  function tap(n: Num) {
    if (solved) return;
    if (sel == null || op == null || sel === n.id) { setSel(sel === n.id ? null : n.id); setOp(null); return; }
    const a = nums.find(x => x.id === sel)!, r = combine(a.v, n.v, op);
    if (r == null) { setMsg(op === "÷" ? "That doesn't divide into a whole number." : "Results must stay above zero."); return; }
    const id = Math.max(...nums.map(x => x.id)) + 1;
    const next = [...nums.filter(x => x.id !== a.id && x.id !== n.id), { id, v: r }];
    setHistory(h => [...h, nums]); setNums(next); setSteps(st => [...st, `${a.v} ${op} ${n.v} = ${r}`]); setSel(id); setOp(null); setMsg(null);
    if (r === round!.target) { setSolved(true); void won("target", steps.length + 1, 20); }
  }
  function undo() { const last = history.at(-1); if (!last) return; setNums(last); setHistory(h => h.slice(0, -1)); setSteps(st => st.slice(0, -1)); setSel(null); setOp(null); setMsg(null); setSolved(false); }
  const closest = round ? nums.reduce((b, n) => (Math.abs(n.v - round.target) < Math.abs(b - round.target) ? n.v : b), nums[0]?.v ?? 0) : 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between"><p className="font-medium">Target</p><span className="text-[12px] text-muted">Mental arithmetic · problem solving</span></div>
      {!round ? (
        <>
          <p className="text-[13.5px] text-muted">Reach the target by combining numbers with + − × ÷. Each number can be used once. Every round can be solved.</p>
          <Button className="self-start" onClick={start}>Play</Button>
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between"><span className="eyebrow">Target</span><span className="tabular font-display text-[44px] leading-none">{round.target}</span></div>
          <div className="grid grid-cols-3 gap-2">
            {nums.map(n => (
              <button key={n.id} onClick={() => tap(n)} aria-pressed={sel === n.id}
                className={cn("tabular rounded-[10px] border py-2.5 font-mono text-[20px]", sel === n.id ? "border-fg bg-surface" : "border-border bg-surface-2 hover:border-gold", solved && n.v === round.target && "border-gold bg-[var(--gold-soft)]")}>{n.v}</button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(["+", "−", "×", "÷"] as Op[]).map(o => (
              <button key={o} disabled={sel == null || solved} onClick={() => setOp(o)} aria-pressed={op === o} aria-label={{ "+": "Add", "−": "Subtract", "×": "Multiply", "÷": "Divide" }[o]}
                className={cn("rounded-full border py-1.5 text-[18px] disabled:opacity-40", op === o ? "border-fg bg-primary text-on-primary" : "border-border")}>{o}</button>
            ))}
          </div>
          <p className="min-h-[20px] text-[13px] text-muted" role="status">
            {solved ? `Solved in ${steps.length} step${steps.length === 1 ? "" : "s"}. +20 lumens.` : msg ?? (sel == null ? "Tap a number." : op == null ? "Now pick an operation." : "Now tap a second number.")}
          </p>
          {steps.length > 0 && <p className="font-mono text-[12.5px] text-muted">{steps.join(" · ")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" disabled={!history.length} onClick={undo}>Undo</Button>
            <Button size="sm" variant="ghost" onClick={start}>{solved ? "Next round" : "New round"}</Button>
            {!solved && nums.length > 0 && <span className="self-center text-[12.5px] text-muted">Closest so far: {closest}</span>}
          </div>
        </>
      )}
    </Card>
  );
}
