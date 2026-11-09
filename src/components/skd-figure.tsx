import { skdFigure } from "@/lib/skd-format";
import "./skd-figure.css";

const descriptions: Record<string, string> = {
  ".": "kosong", o: "lingkaran", x: "persegi", t: "belah ketupat",
  u: "panah atas", d: "panah bawah", l: "panah kiri", r: "panah kanan",
};

const arrowAngles: Record<string, number> = { u: 0, r: 90, d: 180, l: 270 };

function Shape({ cell }: { cell: string }) {
  switch (cell) {
    case "o": return <circle r="9" />;
    case "x": return <rect x="-8.5" y="-8.5" width="17" height="17" />;
    case "t": return <path d="M 0 -11 L 11 0 L 0 11 L -11 0 Z" />;
    default: return <path d="M 0 -12 L 11 -1 H 4 V 11 H -4 V -1 H -11 Z" transform={`rotate(${arrowAngles[cell]})`} />;
  }
}

export function SkdFigureOrText({ value, enabled = true }: { value: string; enabled?: boolean }) {
  const cells = enabled ? skdFigure(value) : null;
  if (!cells) return <span className="preserve-text">{value}</span>;

  const label = [0, 1, 2].map(row => {
    const [left, middle, right] = cells.slice(row * 3, row * 3 + 3).map(cell => descriptions[cell]);
    return `Baris ${row + 1}, kiri ${left}, tengah ${middle}, kanan ${right}`;
  }).join(". ");

  return <svg className="skd-figure" role="img" aria-label={label} focusable="false" viewBox="0 0 120 120" width="120" height="120">
    <g aria-hidden="true">
      <rect x="0.5" y="0.5" width="119" height="119" fill="#fff" stroke="#84968e" />
      <path d="M 40 1 V 119 M 80 1 V 119 M 1 40 H 119 M 1 80 H 119" fill="none" stroke="#9caba4" />
      <g fill="#152a24">
        {cells.map((cell, index) => cell !== "." && (
          <g key={index} transform={`translate(${20 + index % 3 * 40} ${20 + Math.floor(index / 3) * 40})`}>
            <Shape cell={cell} />
          </g>
        ))}
      </g>
    </g>
  </svg>;
}
