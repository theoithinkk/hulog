import Link from "next/link";

// Undyed strands woven over and under: dyed colours mean payment states, so the mark stays straw.
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect x="2" y="9" width="22" height="8" rx="1.5" fill="#d5c494" />
      <rect x="4" y="2" width="5" height="22" rx="1.5" fill="#e8dcb8" />
      <rect x="10.5" y="2" width="5" height="9" rx="1.5" fill="#f6eefa" />
      <rect x="10.5" y="15" width="5" height="9" rx="1.5" fill="#f6eefa" />
      <rect x="17" y="2" width="5" height="22" rx="1.5" fill="#e8dcb8" />
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
}: {
  children?: React.ReactNode;
  aside?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <header className="shell bg-aubergine text-shell-ink">
      <div className={`mx-auto px-5 pt-4 pb-7 ${wide ? "max-w-6xl" : "max-w-xl"}`}>
        <div className="flex items-center justify-between gap-4">
          <Wordmark />
          {aside}
        </div>
        {children}
      </div>
      <div className="weave-band" aria-hidden />
    </header>
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
