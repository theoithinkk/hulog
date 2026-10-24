import Link from "next/link";
import { strands } from "@/lib/strip";
import { Disclaimer, Shell } from "@/app/ui/shell";
import { LEGEND_EN, WeaveLegend, WeaveStrip } from "@/app/ui/weave";

// Synthetic, and labelled as such on the page: 36 installments, 11 paid, the 12th missed and in grace.
const EXAMPLE = strands(36, 11, { graceEnds: new Date("2100-01-01T00:00:00Z") });

export default function Home() {
  return (
    <>
      <Shell wide>
        <div className="grid gap-10 pt-10 pb-4 md:grid-cols-[1.2fr_1fr] md:items-end">
          <div className="flex flex-col gap-5">
            <h1 className="text-[2.5rem] leading-[1.1] font-extrabold md:text-[3.25rem]">
              Your home back home, paid on time, with your rights in plain words.
            </h1>
            <p className="max-w-[38rem] text-lg text-shell-soft">
              Hulog runs property installments in the Philippines on PayPal. If a payment slips, the buyer sees their
              exact grace period and refund rights under the Maceda Law at once, in English or Filipino.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/broker"
                className="rounded-lg bg-shell-ink px-5 py-3 font-bold text-aubergine no-underline hover:bg-white"
              >
                Open the broker demo
              </Link>
            </div>
          </div>
          <figure className="flex w-fit max-w-full flex-col gap-3 rounded-2xl bg-aubergine-raised p-5 md:justify-self-end">
            <WeaveStrip dark strands={EXAMPLE} label="Example strip: 11 of 36 installments paid, the 12th missed and in its grace period" />
            <WeaveLegend dark strands={EXAMPLE} labels={LEGEND_EN} />
            <figcaption className="max-w-[303px] text-[0.9375rem] text-shell-soft">
              Example buyer, not real data. Each strand is one installment.
            </figcaption>
          </figure>
        </div>
      </Shell>

      <main className="mx-auto flex max-w-6xl flex-col gap-12 px-5 pt-10 pb-14">
        <section aria-labelledby="law" className="flex flex-col gap-4">
          <h2 id="law" className="text-2xl font-extrabold">
            What the Maceda Law gives a buyer who misses a payment
          </h2>
          <p className="max-w-[44rem] text-ink-soft">
            Republic Act 6552 protects people buying homes in the Philippines on installment. What it gives depends on
            how long they have been paying.
          </p>
          <dl className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-panel p-5 shadow-[0_2px_12px_rgba(43,19,56,0.08)]">
              <dt className="text-lg font-extrabold">Paid less than 2 years</dt>
              <dd className="mt-2">
                At least 60 days of grace from the missed due date. After that, the seller can cancel only 30 days after
                the buyer receives a notarial notice.
              </dd>
            </div>
            <div className="rounded-2xl bg-panel p-5 shadow-[0_2px_12px_rgba(43,19,56,0.08)]">
              <dt className="text-lg font-extrabold">Paid 2 years or more</dt>
              <dd className="mt-2">
                One month of interest-free grace per year paid, once every 5 years of the contract. If the contract is
                cancelled, a refund of at least 50% of what was paid, rising after year 5 up to 90%.
              </dd>
            </div>
          </dl>
          <p className="max-w-[44rem] text-ink-soft">
            Hulog computes these numbers with fixed, tested rules from each buyer&apos;s real payments. An AI never
            calculates them.
          </p>
        </section>

        <section aria-labelledby="demo" className="flex flex-col gap-4">
          <h2 id="demo" className="text-2xl font-extrabold">
            Try it in three steps
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              ["List a unit", "On the broker page, create a unit. Hulog makes a PayPal installment plan and a payment link."],
              ["Subscribe as the buyer", "Open the link and subscribe with a PayPal sandbox account. You land on the buyer's page."],
              ["Miss a payment", "Press \"Simulate a missed payment\" and read the buyer's rights, in English or Filipino."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="num flex size-9 shrink-0 items-center justify-center rounded-full bg-aubergine font-bold text-shell-ink">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-extrabold">{title}</span>
                  {body}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <Disclaimer />
      </main>
    </>
  );
}
