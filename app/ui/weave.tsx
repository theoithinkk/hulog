import { strandCounts, type Strand } from "@/lib/strip";

// The signature move: one strand per installment, at the same scale on every page.
export function WeaveStrip({
  strands,
  label,
  dark = false,
  hero = false,
}: {
  strands: Strand[];
  label: string;
  dark?: boolean;
  hero?: boolean; // twice the scale: only where the strip is the subject itself (the home page)
}) {
  return (
    <div role="img" aria-label={label} className={`weave${dark ? " weave--dark" : ""}${hero ? " weave--hero" : ""}`}>
      {strands.map((s, i) => (
        <span key={i} className={`strand strand--${s}`} style={{ "--i": i } as React.CSSProperties} />
      ))}
    </div>
  );
}

// The strip as ornament between landing sections: undyed strands only, so it never reads as payment data.
export function WeaveDivider({ count = 56 }: { count?: number }) {
  return (
    <div aria-hidden className="weave-divider">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ "--i": i } as React.CSSProperties} />
      ))}
    </div>
  );
}

export type LegendLabels = Record<Strand, string>;

export const LEGEND_EN: LegendLabels = { paid: "Paid", grace: "In grace", missed: "Missed", upcoming: "To go" };
export const LEGEND_FIL: LegendLabels = {
  paid: "Bayad na",
  grace: "Nasa grace period",
  missed: "Hindi nabayaran",
  upcoming: "Natitira",
};

// Counts in words beside each swatch, so no state is carried by colour alone.
export function WeaveLegend({ strands, labels, dark = false }: { strands: Strand[]; labels: LegendLabels; dark?: boolean }) {
  const counts = strandCounts(strands);
  const shown = (Object.keys(counts) as Strand[]).filter((s) => counts[s] > 0 || s === "paid");
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem] ${dark ? "text-shell-soft weave--dark" : "text-ink-soft"}`}>
      {shown.map((s) => (
        <li key={s} className="flex items-center gap-2">
          <span aria-hidden className={`strand strand--${s} swatch`} />
          {labels[s]} <span className="num font-semibold">{counts[s]}</span>
        </li>
      ))}
    </ul>
  );
}
