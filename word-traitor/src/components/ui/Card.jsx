import { cn } from "../../lib/utils";

export default function Card({ children, className = "" }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/12 bg-slate-950/72 backdrop-blur-2xl",
        "shadow-[0_24px_80px_-38px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.03)]",
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(34,211,238,0.12),transparent_38%,rgba(217,70,239,0.12))] before:opacity-90",
        className
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
