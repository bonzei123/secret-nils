import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(value, {
      margin: 1,
      width: 280,
      color: { dark: "#24170f", light: "#fffaf1" },
    }).then((url) => {
      if (live) setSrc(url);
    });
    return () => {
      live = false;
    };
  }, [value]);
  if (!src) return null;
  return <img className="qr" src={src} alt="QR-Code zum Beitrittslink" />;
}
