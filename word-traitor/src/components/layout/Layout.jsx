import React from "react";

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      
      {/* 🔝 Navbar */}
      <header className="w-full border-b border-zinc-800 px-4 py-3 flex justify-between items-center">
        <h1 className="text-lg sm:text-xl font-bold text-cyan-400">
          🎭 Word Traitor
        </h1>

        <span className="text-xs sm:text-sm text-zinc-400">
          Multiplayer Game
        </span>
      </header>

      {/* 📦 Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>

      {/* 🔻 Footer */}
      <footer className="border-t border-zinc-800 text-center text-xs text-zinc-500 py-3">
        Built with ❤️ using Socket.IO
      </footer>
    </div>
  );
}

export default Layout;