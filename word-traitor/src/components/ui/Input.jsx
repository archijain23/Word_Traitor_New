import { cn } from "../../lib/utils";

export default function Input({ className = "", ...props }) {
  return (
    <input
      {...props}
      className={cn(
        "w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10",
        "text-white placeholder:text-white/40 outline-none",
        "focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/20",
        className
      )}
    />
  );
}