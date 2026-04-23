import { cn } from "../../lib/utils";

export default function Button({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={cn(
        "px-4 py-2 rounded-xl font-medium transition-all duration-200",
        "bg-cyan-500/10 border border-cyan-400/30 text-cyan-300",
        "hover:bg-cyan-500/20 hover:border-cyan-400/60",
        "active:scale-95",
        className
      )}
    >
      {children}
    </button>
  );
}