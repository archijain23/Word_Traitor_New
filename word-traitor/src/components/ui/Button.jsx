import { cn } from "../../lib/utils";

export default function Button({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-2xl border px-4 py-2.5 font-semibold tracking-[0.08em] transition-all duration-200",
        "border-cyan-300/30 bg-[linear-gradient(135deg,rgba(34,211,238,0.24),rgba(14,165,233,0.14)_48%,rgba(217,70,239,0.22))] text-white",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_45px_-22px_rgba(34,211,238,0.9)]",
        "hover:-translate-y-0.5 hover:border-cyan-200/55 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_22px_60px_-22px_rgba(217,70,239,0.9)]",
        "active:translate-y-0 active:scale-[0.985]",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0",
        className
      )}
    >
      {children}
    </button>
  );
}
