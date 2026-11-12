// The AI parts of a daily session, run with the person's own Gemini key.
import type { Area, Profile } from "./model";
import { generateJson } from "./gemini";

export interface Question { q: string; options: string[]; answer: number; explain: string }
export interface Exercise { title: string; task: string; tips: string[]; minutes: number }
export interface Review { scores: { name: string; score: number }[]; strengths: string[]; fixes: string[]; better: string }

const who = (p: Profile) => (p.goal ? `Their goal: "${p.goal.slice(0, 400)}".` : "");

export async function warmUp(key: string, area: Area, extras: Area[], p: Profile): Promise<Question[]> {
  const also = extras.length ? ` Make one question about ${extras.map(e => e.name).join(" or ")} instead.` : "";
  const qs = await generateJson<Question[]>(key, [
    `Write 3 quick multiple-choice warm-up questions for someone improving at "${area.name}".${also} ${who(p)}`,
    `Practical, not trivia. Each has 4 short options and exactly one right answer.`,
    `Reply with JSON only: [{"q": "...", "options": ["...","...","...","..."], "answer": 0-3, "explain": "one sentence"}]`,
  ].join("\n"));
  return (Array.isArray(qs) ? qs : []).filter(q => q && Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length).slice(0, 3);
}

export async function exercise(key: string, area: Area, p: Profile, minutes: number): Promise<Exercise> {
  const e = await generateJson<Exercise>(key, [
    `Design one ${minutes}-minute practice exercise for someone improving at "${area.name}". ${who(p)}`,
    `The person answers in writing in a text box (for speaking skills, ask them to write what they would say). Make it concrete, with a realistic scenario.`,
    `Reply with JSON only: {"title": "short title", "task": "the instructions, 2-4 sentences", "tips": ["up to 3 short tips"], "minutes": ${minutes}}`,
  ].join("\n"));
  if (!e || typeof e.task !== "string") throw new Error("bad_exercise");
  return { title: e.title || "Practice", task: e.task, tips: Array.isArray(e.tips) ? e.tips.slice(0, 3) : [], minutes };
}

export async function review(key: string, area: Area, ex: Exercise, answer: string): Promise<Review> {
  const r = await generateJson<Review>(key, [
    `You are a kind, exacting coach for "${area.name}". Review this answer to the exercise.`,
    `Exercise: ${ex.task}`,
    `Answer: """${answer.slice(0, 4000)}"""`,
    `Score 3 or 4 criteria that matter for this skill, 1-5 each. Be specific and quote their words where helpful.`,
    `Reply with JSON only: {"scores": [{"name": "...", "score": 1-5}], "strengths": ["up to 3"], "fixes": ["up to 3, each actionable"], "better": "a short improved version of one part of their answer"}`,
  ].join("\n"));
  return {
    scores: (r.scores ?? []).filter(s => s && typeof s.score === "number").map(s => ({ name: String(s.name), score: Math.max(1, Math.min(5, Math.round(s.score))) })).slice(0, 4),
    strengths: (r.strengths ?? []).slice(0, 3), fixes: (r.fixes ?? []).slice(0, 3), better: String(r.better ?? ""),
  };
}
