import { useEffect, useState } from "react";

/** Öffentliche Adresse für Links und QR. Fällt auf die Adresszeile zurück. */
export function usePublicOrigin(): string {
  const [origin, setOrigin] = useState(() => window.location.origin);
  useEffect(() => {
    let live = true;
    void fetch("/api/site")
      .then((response) => response.json())
      .then((body: { origin?: string | null }) => {
        if (live && body.origin) setOrigin(body.origin.replace(/\/$/, ""));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return origin;
}
