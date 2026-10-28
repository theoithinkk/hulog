import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { strands } from "@/lib/strip";
import { Disclaimer, Shell } from "@/app/ui/shell";
import { LEGEND_EN, WeaveDivider, WeaveLegend, WeaveStrip } from "@/app/ui/weave";

// Synthetic, and labelled as such on the page: 36 installments, 11 paid, the 12th missed and in grace.
const HEADLINE = "Your home back home, paid on time.";

const EXAMPLE = strands(36, 11, { graceEnds: new Date("2100-01-01T00:00:00Z") });

// Open-licence photographs of the world around Hulog (never presented as Hulog's own); credits in the footer.
const CREDITS = [
  ["Mat (Banig) Weaving at Saob Cave in Brgy. Basiao, Basey, Samar", "Lawrence Ruiz", "https://commons.wikimedia.org/w/index.php?curid=43914135"],
  ["Banigan-Kawayan Festival", "Lawrence Ruiz", "https://commons.wikimedia.org/w/index.php?curid=43912844"],
  ["Makati skyline, Poblacion (2018)", "Patrick Roque", "https://commons.wikimedia.org/w/index.php?curid=67804873"],
  ["Ortigas Center skyline at sunset (2017)", "Patrick Roque", "https://commons.wikimedia.org/w/index.php?curid=78156066"],
] as const;

export default function Home() {
  return (
    <>
      <Shell
        wide
        playful
        aside={
          <nav aria-label="Sections" className="flex items-center gap-1 text-[0.9375rem]">
            <a href="#banig" className="nav-link hidden sm:inline-block">
              The weave
            </a>
            <a href="#law" className="nav-link hidden sm:inline-block">
              The law
            </a>
            <a href="#demo" className="nav-link hidden sm:inline-block">
              Try it
            </a>
            <Link
              href="/broker"
              className="btn-paper ml-2 rounded-lg bg-shell-ink px-3.5 py-1.5 font-bold text-aubergine no-underline hover:bg-white"
            >
              Broker demo
            </Link>
          </nav>
        }
      >
        <h1 className="mx-auto max-w-[14ch] pt-10 text-center text-[2.25rem] leading-[1.02] font-extrabold tracking-[-0.03em] md:text-[3.25rem] lg:text-[4.5rem]">
          {/* Each word drops in like a paper letter stuck down; the sentence still reads as one. */}
          {HEADLINE.split(" ").map((word, i) => (
            <Fragment key={i}>
              <span className="word" style={{ "--i": i } as React.CSSProperties}>
                {word}
              </span>{" "}
            </Fragment>
          ))}
        </h1>
        <div className="flex flex-col items-center gap-10 pt-6 pb-6 text-center">
          <div className="rise flex flex-col items-center gap-6">
            <p className="max-w-[38rem] text-lg text-shell-soft">
              Hulog runs property installments in the Philippines on PayPal. If a payment slips, the buyer sees their
              exact grace period and refund rights under the Maceda Law at once, in English or Filipino.
            </p>
            <Link
              href="/broker"
              className="inline-block btn-paper rounded-lg bg-shell-ink px-6 py-3 font-bold text-aubergine no-underline hover:bg-white"
            >
              Open the broker demo
            </Link>
          </div>
          <div className="rise rise--late relative isolate max-w-full text-left">
            <span aria-hidden className="cutout cutout--disc -top-10 -right-12 hidden sm:block" />
            <span aria-hidden className="cutout cutout--leaf -bottom-9 -left-10 hidden sm:block" />
            <span aria-hidden className="cutout cutout--strip -bottom-3 right-10 hidden lg:block" />
            <figure className="cut-dark flex -rotate-1 flex-col gap-4 p-5 sm:p-6">
              <WeaveStrip
                dark
                hero
                strands={EXAMPLE}
                label="Example strip: 11 of 36 installments paid, the 12th missed and in its grace period"
              />
              <WeaveLegend dark strands={EXAMPLE} labels={LEGEND_EN} />
              <figcaption className="max-w-[36rem] text-[0.9375rem] text-shell-soft">
                An example buyer, not real data. Each strand is one installment; the hatched one was missed and is
                still inside its grace period.
              </figcaption>
            </figure>
          </div>
        </div>
      </Shell>

      <div className="home-ground">
        {/* Loose paper scraps scattered across the mat; decoration only, so hidden from readers. */}
        <span aria-hidden className="cutout cutout--disc top-[6%] -left-14 hidden md:block" />
        <span aria-hidden className="cutout cutout--leaf top-[22%] -right-6 hidden md:block" />
        <span aria-hidden className="cutout cutout--strip top-[44%] -left-10 hidden lg:block" />
        <span aria-hidden className="cutout cutout--disc top-[63%] -right-16 hidden md:block" />
        <span aria-hidden className="cutout cutout--leaf top-[84%] left-[4%] hidden lg:block" />
      <main className="mx-auto flex max-w-6xl flex-col gap-24 px-5 pt-14 pb-14">
        <section aria-labelledby="banig" className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <figure className="taped flex flex-col gap-2">
            <Image
              src="/photos/banig-weaving.jpg"
              alt="Weavers making banig mats from dyed tikog strands at Saob Cave in Basey, Samar"
              width={1920}
              height={1440}
              sizes="(min-width: 1024px) 640px, 100vw"
              className="aspect-[4/3] w-full print object-cover"
            />
            <figcaption className="text-[0.9375rem] text-ink-soft">Weaving banig at Saob Cave, Basey, Samar.</figcaption>
          </figure>
          <div className="flex flex-col gap-4">
            <h2 id="banig" className="text-2xl font-extrabold label-cut">
              Woven one strand at a time
            </h2>
            <p>
              A banig is woven strand by strand, and an installment plan is paid month by month. Hulog draws every
              buyer&apos;s plan the same way: green for paid, a turmeric hatch for a payment still in its grace period, a
              gap for one that was missed, and plain straw for the months to go.
            </p>
            <figure className="taped flex flex-col gap-2">
              <Image
                src="/photos/banigan-festival.jpg"
                alt="Woven banig bags, boxes and round mats on display at the Banigan-Kawayan Festival"
                width={1920}
                height={1440}
                sizes="(min-width: 1024px) 460px, 100vw"
                className="aspect-[4/3] w-full print object-cover"
              />
              <figcaption className="text-[0.9375rem] text-ink-soft">Finished work at the Banigan-Kawayan Festival.</figcaption>
            </figure>
          </div>
        </section>

        <WeaveDivider />

        <section aria-labelledby="law" className="flex flex-col gap-6">
          <div className="flex max-w-[44rem] flex-col gap-3">
            <h2 id="law" className="text-2xl font-extrabold label-cut">
              What the Maceda Law gives a buyer who misses a payment
            </h2>
            <p className="text-ink-soft">
              Republic Act 6552 protects people buying homes in the Philippines on installment. What it gives depends on
              how long they have been paying.
            </p>
          </div>
          <dl className="grid gap-4 md:grid-cols-2">
            <div className="paper lift flex flex-col gap-3 p-6">
              <dt className="text-lg font-extrabold">Paid less than 2 years</dt>
              <dd className="stat">60 days grace</dd>
              <dd>
                At least 60 days of grace from the missed due date. After that, the seller can cancel only 30 days after
                the buyer receives a notarial notice.
              </dd>
            </div>
            <div className="paper lift flex flex-col gap-3 p-6">
              <dt className="text-lg font-extrabold">Paid 2 years or more</dt>
              <dd className="stat">50–90% back</dd>
              <dd>
                One month of interest-free grace per year paid, once every 5 years of the contract. If the contract is
                cancelled, a refund of at least 50% of what was paid, rising after year 5 up to 90%.
              </dd>
            </div>
          </dl>
          <p className="max-w-[44rem] text-ink-soft">
            Hulog computes these numbers with fixed, tested rules from each buyer&apos;s real payments, reviewed by a
            licensed real estate broker. An AI never calculates them.
          </p>
        </section>

        <WeaveDivider />

        <section aria-labelledby="demo" className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
          <div className="flex flex-col gap-5">
            <h2 id="demo" className="text-2xl font-extrabold label-cut">
              Try it in three steps
            </h2>
            <ol className="flex flex-col gap-4">
              {[
                ["List a unit", "On the broker page, create a unit. Hulog makes a PayPal installment plan and a payment link."],
                ["Subscribe as the buyer", "Open the link and subscribe with a PayPal sandbox account. You land on the buyer's page."],
                ["Miss a payment", "Press \"Simulate a missed payment\" and read the buyer's rights, in English or Filipino."],
              ].map(([title, body], i) => (
                <li key={title} className="paper lift flex gap-4 p-4">
                  <span className="num flex size-9 shrink-0 items-center justify-center badge-cut rounded-full bg-aubergine font-bold text-shell-ink">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-extrabold">{title}</span>
                    {body}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <figure className="taped flex flex-col gap-2">
              <Image
                src="/photos/makati-skyline.jpg"
                alt="Condominium towers in Poblacion, Makati"
                width={1920}
                height={1440}
                sizes="(min-width: 1024px) 330px, 50vw"
                className="aspect-[3/4] w-full print object-cover"
              />
              <figcaption className="text-[0.9375rem] text-ink-soft">Makati.</figcaption>
            </figure>
            <figure className="taped flex flex-col gap-2">
              <Image
                src="/photos/ortigas-skyline.jpg"
                alt="The Ortigas Center skyline at sunset"
                width={1920}
                height={1440}
                sizes="(min-width: 1024px) 330px, 50vw"
                className="aspect-[3/4] w-full print object-cover"
              />
              <figcaption className="text-[0.9375rem] text-ink-soft">Ortigas Center.</figcaption>
            </figure>
          </div>
        </section>

        <footer className="flex flex-col gap-3 pt-4">
          <Disclaimer />
          <p className="text-[0.9375rem] text-ink-soft">
            Photographs, all CC BY-SA 4.0 via Wikimedia Commons:{" "}
            {CREDITS.map(([title, by, href], i) => (
              <span key={href}>
                <a href={href} className="text-ink-soft underline">
                  {title}
                </a>{" "}
                by {by}
                {i < CREDITS.length - 1 ? "; " : "."}
              </span>
            ))}
          </p>
        </footer>
      </main>
      </div>
    </>
  );
}
