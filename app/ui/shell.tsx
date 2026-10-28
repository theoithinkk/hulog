import Link from "next/link";

// A 3x3 banig weave in undyed straw: dyed colours mean payment states, so the mark never uses them.
// Straw weft runs under the pale warp, then comes over it at every other crossing. Same drawing as app/icon.svg.
const OVER = [
  [0, 1],
  [1, 0],
  [1, 2],
  [2, 1],
];

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      {[2, 10, 18].map((y) => (
        <rect key={`w${y}`} x="1" y={y} width="24" height="6" rx="1.5" fill="#d5c494" />
      ))}
      {[2, 10, 18].map((x) => (
        <rect key={`v${x}`} x={x} y="1" width="6" height="24" rx="1.5" fill="#f6eefa" />
      ))}
      {OVER.map(([r, c]) => (
        <rect key={`o${r}${c}`} x={2 + 8 * c} y={2 + 8 * r} width="6" height="6" fill="#d5c494" />
      ))}
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-xl font-extrabold tracking-wide text-shell-ink no-underline">
      <Mark />
      Hulog
    </Link>
  );
}

// The aubergine shell every page opens with. `wide` for the broker's working screen.
export function Shell({
  children,
  aside,
  wide = false,
  playful = false,
}: {
  children?: React.ReactNode;
  aside?: React.ReactNode;
  wide?: boolean;
  playful?: boolean;
}) {
  const width = wide ? "max-w-6xl" : "max-w-xl";
  // The landing page is the playful one (torn paper, a reading strand); the working pages stay calm,
  // with a straight straw band, so buyers and brokers read figures rather than decoration.
  const torn = playful ? " torn" : "";
  return (
    <>
      <header className={`topbar shell text-shell-ink${torn}`}>
        {playful && <span aria-hidden className="scroll-strand" />}
        <div className={`topbar-inner mx-auto flex items-center justify-between gap-4 px-5 py-3.5 ${width}`}>
          <Wordmark />
          {aside}
        </div>
      </header>
      <section aria-label="Overview" className="shell-wrap">
        <div className={`shell bg-aubergine text-shell-ink${torn}`}>
          <div className={`mx-auto px-5 pt-1 ${playful ? "pb-11" : "pb-8"} ${width}`}>{children}</div>
        </div>
        <div className={playful ? "banig-strip" : "weave-band"} aria-hidden />
      </section>
    </>
  );
}

export function Disclaimer({ fil = false }: { fil?: boolean }) {
  return (
    <p className="text-[0.9375rem] text-ink-soft" lang={fil ? "fil" : "en"}>
      {fil
        ? "Impormasyon lamang ito, hindi legal na payo. Kumonsulta sa abogado o lisensyadong broker."
        : "Information only, not legal advice. Consult a lawyer or licensed broker."}
    </p>
  );
}
