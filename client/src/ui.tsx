import { useEffect, useState, type ReactNode } from "react";

export function Logo() {
  return (
    <div className="seal" aria-hidden>
      <svg viewBox="0 0 64 64">
        <path
          fill="currentColor"
          d="M32 8c2.2 10 10 16 18 16-8 2.4-13 10-13 20 0-10-5-17.6-13-20 8 0 15.8-6 16-16z"
        />
      </svg>
    </div>
  );
}

export function useCountdown(seconds: number | null): number | null {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (seconds === null) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setLeft(Math.max(0, seconds - Math.floor((Date.now() - started) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [seconds]);
  return left;
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return "—";
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${mins}:${rest.toString().padStart(2, "0")}`;
}

export function SecretCover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      <button type="button" className="btn secondary" onClick={() => setOpen((value) => !value)}>
        {open ? "Verbergen" : label}
      </button>
      {open ? children : <p className="secret-cover">{label}. Bildschirm abdecken, nicht herumzeigen.</p>}
    </div>
  );
}
