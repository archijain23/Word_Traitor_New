import { cn } from "../../lib/utils";

export default function Card({ children, className = "" }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl",
        "shadow-lg shadow-black/30",
        className
      )}
    >
      {children}
    </div>
  );
}