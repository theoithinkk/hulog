import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="text-4xl font-bold">Hulog</h1>
      <p className="text-lg">
        Pay your condo back home on time with PayPal, and know your rights under
        the Maceda Law if a payment slips.
      </p>
      <Link href="/broker" className="w-fit rounded bg-blue-700 px-4 py-2 font-medium text-white">
        Try the demo
      </Link>
      <p className="text-sm opacity-70">
        Information only, not legal advice. Consult a lawyer or licensed broker.
      </p>
    </main>
  );
}
