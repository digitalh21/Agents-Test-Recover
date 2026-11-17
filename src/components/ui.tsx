"use client";

import { cn } from "@/lib/utils";
import type { ReactNode, ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

// ─── Button ───────────────────────────────────────────────────────
const btnVariants: Record<string, string> = {
  default: "bg-slate-900 text-white hover:bg-slate-700 shadow-sm",
  primary: "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm",
  danger: "bg-rose-600 text-white hover:bg-rose-500 shadow-sm",
  warning: "bg-amber-500 text-white hover:bg-amber-400 shadow-sm",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  whatsapp: "bg-[#25D366] text-white hover:bg-[#1ebe5b] shadow-sm",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof btnVariants; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        btnVariants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

// ─── Card ─────────────────────────────────────────────────────────
export function Card({
  className,
  children,
  ...props
}: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)} {...props}>
      {children}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────
export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

// ─── Inputs ───────────────────────────────────────────────────────
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50",
        className
      )}
      {...props}
    />
  );
}

/**
 * Number input hardened against accidental value changes:
 * - mouse wheel scrolling is ignored (blurs the field)
 * - ArrowUp/ArrowDown increment keys are disabled
 * - native spinner arrows removed (also prevents touch-swipe steps)
 */
export function NumberInput({ className, onWheel, onKeyDown, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={cn(
        "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50",
        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        className
      )}
      onWheel={(e) => {
        (e.target as HTMLInputElement).blur();
        onWheel?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
        onKeyDown?.(e);
      }}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

// ─── Modal / Dialog ───────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  fullScreen = false,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  fullScreen?: boolean;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative bg-white shadow-2xl overflow-hidden flex flex-col",
          fullScreen
            ? "w-full h-full sm:h-[95vh] sm:w-[95vw] sm:max-w-3xl sm:rounded-2xl"
            : cn("w-full sm:w-auto sm:min-w-[420px] max-h-[92vh] rounded-t-2xl sm:rounded-2xl", maxWidth)
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3">
          <div className="font-semibold text-slate-900 text-sm sm:text-base truncate pr-4">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-rose-100 hover:text-rose-600 text-lg font-bold"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors border",
            active === t.key
              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
              : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
          )}
        >
          {t.label}
          {typeof t.count === "number" && (
            <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]", active === t.key ? "bg-white/20" : "bg-slate-100")}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Spinner / Empty ──────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-10", className)}>
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
    </div>
  );
}

export function Empty({ icon = "📭", text }: { icon?: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", accent ?? "text-slate-900")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </Card>
  );
}
