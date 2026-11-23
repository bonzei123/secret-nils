import { useEffect, useState, type ReactNode } from "react";

const LEAFLETS: readonly { angle: number; length: number }[] = [
  { angle: 0, length: 32 },
  { angle: -32, length: 28 },
  { angle: 32, length: 28 },
  { angle: -62, length: 23 },
  { angle: 62, length: 23 },
  { angle: -96, length: 16 },
  { angle: 96, length: 16 },
];

/** Siebenfingriges Blatt. `bad` legt ein Dollarzeichen darauf: Eigeninteresse. */
export function Leaf({ tone = "good" }: { tone?: "good" | "bad" | "club" }) {
  return (
    <svg className={`leaf leaf-${tone}`} viewBox="0 0 64 64" aria-hidden>
      <g fill="currentColor">
        {LEAFLETS.map((leaflet) => (
          <path
            key={leaflet.angle}
            d={leafletPath(leaflet.length)}
            transform={`translate(32 44) rotate(${leaflet.angle})`}
          />
        ))}
      </g>
      <path d="M32 44c.4 6 .1 11 0 16" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M32 52c-8 3-10 7-6 9M32 54c8 2 11 6 7 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {tone === "bad" && (
        <>
          <circle cx="32" cy="31" r="10" fill="#fff6ee" />
          <text x="32" y="36.5" textAnchor="middle" fontSize="16" fontWeight="800" fill="#9d1c1c" fontFamily="Georgia, serif">
            $
          </text>
        </>
      )}
    </svg>
  );
}

function leafletPath(length: number): string {
  const waist = length * 0.16;
  const mid = length * 0.72;
  return `M0 0C${-waist} ${-length * 0.42} ${-waist * 0.8} ${-mid} 0 ${-length}C${waist * 0.8} ${-mid} ${waist} ${-length * 0.42} 0 0`;
}

export function Logo() {
  return (
    <div className="seal" aria-hidden>
      <Leaf tone="club" />
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
