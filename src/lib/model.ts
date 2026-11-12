// Lumen's data model. Everything here is saved in the user's own Google Drive
// (Lumen folder) with a working copy on the device.

export type Category = "skill" | "lang" | "career" | "mind" | "interest" | "news";
export type Freq = "Daily" | "Weekly" | "Sometimes" | "Paused";
export type PlanMode = "Lumen plans each day" | "Same focus every day" | "I choose each day";
export type Format = "Videos" | "Short clips" | "Podcasts" | "Books" | "Articles" | "Exercises and games";

export interface Area { id: string; name: string; cat: Category; freq: Freq; star: boolean }

export interface Profile {
  goal: string;
  formats: Format[];
  minutes: number;
  planMode: PlanMode;
  areas: Area[];
  steps: Record<SessionPart, boolean>;
  createdAt: number;
}

export type SessionPart = "Warm-up" | "Learn" | "Practise" | "Reflect" | "News brief" | "Today's reading" | "Unwind picks" | "Games";

export interface AiSettings { mode: "own" | "none"; key?: string; connectedAt?: number }

export type BlockType = "item" | "creator" | "topic" | "platform";
export interface Block { type: BlockType; value: string; reason?: string; at: number }

export interface Added { url: string; source: string; area: string; why?: string; creator?: string; at: number }

/** Every document Lumen stores, by name. Each is one JSON file in the user's Lumen folder. */
export interface Docs {
  profile: Profile;
  ai: AiSettings;
  blocked: Block[];
  added: Added[];
}
export type DocName = keyof Docs;

export const CATEGORY_NAME: Record<Category, string> = {
  skill: "Skill", lang: "Language", career: "Career", mind: "Mind and habits", interest: "Interest", news: "News",
};

export const AREA_LIBRARY: [Category, string, string[]][] = [
  ["skill", "Skills", ["Communication", "Public speaking", "Presentation", "Writing", "Critical thinking", "Problem solving", "Leadership", "Management", "Negotiation", "Storytelling", "Sales"]],
  ["lang", "Languages", ["English", "Advanced English", "French", "Spanish", "German", "Chinese", "Arabic", "Portuguese", "Japanese", "Yoruba", "Igbo", "Hausa", "Swahili"]],
  ["career", "Career and tech", ["Coding", "Data analysis", "AI tools", "Design", "Product management", "Marketing", "Personal finance", "Investing", "Entrepreneurship", "Project management"]],
  ["mind", "Mind and habits", ["Focus", "Memory", "Confidence", "Presence", "Discipline", "Consistency", "Organization", "Attention to detail", "Processing speed", "Mindfulness", "Sleep", "Fitness"]],
  ["interest", "Interests", ["General knowledge", "History", "Science", "Philosophy", "Chess", "Music", "Art", "Cooking", "Faith and scripture", "Parenting"]],
  ["news", "News to follow", ["Manchester United", "Arsenal", "Real Madrid", "NBA", "Formula 1", "Tech news", "AI news", "Business news", "Science news", "World news"]],
];

export const FORMATS: Format[] = ["Videos", "Short clips", "Podcasts", "Books", "Articles", "Exercises and games"];
export const PLAN_MODES: { mode: PlanMode; hint: string }[] = [
  { mode: "Lumen plans each day", hint: "Rotates through your areas, weighted by your goals and weak spots" },
  { mode: "Same focus every day", hint: "Best for one big goal, like an exam" },
  { mode: "I choose each day", hint: "A short menu every morning; Lumen still suggests one" },
];
export const SESSION_PARTS: SessionPart[] = ["Warm-up", "Learn", "Practise", "Reflect", "News brief", "Today's reading", "Unwind picks", "Games"];

export function slug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "area";
}

export function makeArea(name: string, cat: Category, star = false): Area {
  return { id: slug(name), name: name.trim(), cat, freq: cat === "lang" || cat === "news" ? "Daily" : "Weekly", star };
}

export function defaultProfile(areas: Area[] = []): Profile {
  return {
    goal: "",
    formats: ["Videos", "Short clips", "Podcasts", "Books", "Exercises and games"],
    minutes: 20,
    planMode: "Lumen plans each day",
    areas,
    steps: Object.fromEntries(SESSION_PARTS.map(p => [p, true])) as Record<SessionPart, boolean>,
    createdAt: Date.now(),
  };
}
