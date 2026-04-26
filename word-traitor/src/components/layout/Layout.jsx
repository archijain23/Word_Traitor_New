import React from "react";

function Layout({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10rem] top-[-8rem] h-72 w-72 rounded-full bg-cyan-400/18 blur-3xl" />
        <div className="absolute right-[-8rem] top-20 h-72 w-72 rounded-full bg-fuchsia-500/18 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/3 h-80 w-80 rounded-full bg-violet-500/18 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/60 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-black tracking-[0.22em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-400 drop-shadow-[0_0_22px_rgba(56,189,248,0.45)] sm:text-xl">
              WORD TRAITOR
            </h1>
            <p className="mt-1 text-[11px] uppercase tracking-[0.32em] text-cyan-100/55">
              
            </p>
          </div>

          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.18)] sm:text-xs">
            Live Lobby
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="w-full">{children}</div>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-slate-950/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-4 text-center text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-left">
          <span></span>
          <span className="text-cyan-200/70"></span>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
