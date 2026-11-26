import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  // Lantern amber is the one next action on a screen (DESIGN.md: One Lantern Rule).
  primary: "bg-lantern font-semibold text-lantern-ink hover:bg-lantern-hover",
  secondary: "border border-ice-strong bg-surface text-ink hover:border-frost hover:bg-ice",
  ghost: "text-muted hover:bg-ice hover:text-ink",
  danger: "bg-rose-700 text-white hover:bg-rose-600",
};

export function buttonClass(variant: Variant = "primary", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    className,
  );
}

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-line bg-surface p-5 text-ink shadow-sm", className)}
      {...props}
    />
  );
}

type Tone = "slate" | "sky" | "green" | "amber" | "rose" | "violet";
const tones: Record<Tone, string> = {
  // Neutral and info tones use the winter tokens; status colours stay tinted with dark text.
  slate: "bg-ice text-muted",
  sky: "bg-ice text-frost",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  // Kept as an API name; drawn as an outlined frost chip (No-Violet Rule).
  violet: "bg-surface text-frost ring-1 ring-inset ring-ice-strong",
};

export function Badge({ tone = "slate", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} {...props} />;
}

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-sky-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(field, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn(field, props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(field, props.className)} />;
}
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium text-ink", className)} {...props} />;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="yk-phrase mt-2 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-ice-strong p-8 text-center text-sm text-muted">{children}</p>;
}
