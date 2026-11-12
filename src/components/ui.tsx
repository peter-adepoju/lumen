"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Category } from "@/lib/model";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "quiet"; size?: "md" | "sm"; block?: boolean };
export function Button({ variant = "primary", size = "md", block, className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[.01em] transition disabled:cursor-not-allowed disabled:opacity-40",
        size === "md" ? "min-h-9 px-4 text-[14px]" : "min-h-[30px] px-3 text-[13px]",
        variant === "primary" && "bg-primary text-on-primary hover:opacity-90",
        variant === "ghost" && "border border-border bg-transparent hover:bg-surface-2",
        variant === "quiet" && "px-1 text-muted underline underline-offset-4 hover:text-fg",
        block && "w-full",
        className,
      )}
    />
  );
}

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" }) {
  return <As className={cn("rounded-[14px] border border-border bg-surface p-4", className)}>{children}</As>;
}

const CHIP: Record<Category | "neutral", string> = {
  skill: "text-[var(--skill)] bg-[var(--skill-soft)]",
  lang: "text-[var(--lang)] bg-[var(--lang-soft)]",
  career: "text-[var(--career)] bg-[var(--career-soft)]",
  mind: "text-[var(--improve)] bg-[var(--improve-soft)]",
  interest: "text-muted bg-surface-2",
  news: "text-muted bg-surface-2",
  neutral: "text-muted bg-surface-2",
};
export function Chip({ cat = "neutral", children }: { cat?: Category | "neutral"; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", CHIP[cat])}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function Pill({ on, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      {...p}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13.5px] transition",
        on ? "border-fg bg-fg text-bg" : "border-border bg-surface hover:border-gold",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, id, label }: { checked: boolean; onChange: (v: boolean) => void; id: string; label: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-[42px] shrink-0 rounded-full border transition", checked ? "border-gold bg-gold" : "border-border bg-surface-2")}
    >
      <span className={cn("absolute left-0.5 top-0.5 size-[18px] rounded-full bg-surface shadow transition", checked && "translate-x-[18px]")} />
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-full bg-surface-2 p-[3px]">
      {options.map(o => (
        <button
          key={String(o.value)}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-full px-3 py-1 text-[13px] font-medium transition", o.value === value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 pt-3 lg:pt-0">
      <div>
        <h1 className="text-[34px] leading-[1.1] lg:text-[52px] lg:leading-[1.05]">{title}</h1>
        {sub && <p className="mt-1 text-muted lg:mt-2 lg:text-[16px]">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-3 flex items-baseline justify-between gap-3 px-0.5">
      <h2 className="text-[20px] lg:text-[22px]">{children}</h2>
      {right && <span className="text-[12.5px] text-muted">{right}</span>}
    </div>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-3 border-t border-border py-2.5 first:border-t-0", className)}>{children}</div>;
}
