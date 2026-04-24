import { useEffect } from "react";

function Modal({ isOpen, onClose, children }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-[28px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(8,12,28,0.98),rgba(18,22,40,0.96))] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_30px_90px_-30px_rgba(34,211,238,0.5)]">
        {children}
      </div>
    </div>
  );
}

export default Modal;
