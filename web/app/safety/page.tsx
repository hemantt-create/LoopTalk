import Link from "next/link";

const safetyItems = [
  "Be respectful.",
  "Do not harass or abuse others.",
  "Do not share private information.",
  "Leave or report if you feel uncomfortable.",
  "Use earphones for better voice quality.",
];

export default function SafetyPage() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#f7f4ee] text-[#151515]">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(19,170,145,0.16),transparent_35%),linear-gradient(300deg,rgba(244,98,76,0.14),transparent_38%)]" />

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link className="text-xl font-black tracking-tight" href="/">
            LoopTalk
          </Link>
          <Link className="text-sm font-bold text-[#287d70]" href="/privacy">
            Privacy
          </Link>
        </header>

        <div className="flex flex-1 items-center py-12">
          <div className="w-full">
            <p className="mb-5 inline-flex rounded-full border border-[#151515]/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[#287d70] shadow-sm backdrop-blur">
              Safety
            </p>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              Keep conversations comfortable.
            </h1>
            <div className="mt-8 rounded-3xl border border-[#151515]/10 bg-white/72 p-5 shadow-sm backdrop-blur">
              <ul className="grid gap-4">
                {safetyItems.map((item) => (
                  <li key={item} className="flex gap-3 text-[#505050]">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-2.5 shrink-0 rounded-full bg-[#f4624c] ring-4 ring-[#f4624c]/15"
                    />
                    <span className="text-base font-semibold leading-7">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              className="mt-8 inline-flex items-center justify-center rounded-full bg-[#151515] px-6 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(21,21,21,0.18)] transition hover:-translate-y-0.5 hover:bg-[#252525] focus:outline-none focus:ring-4 focus:ring-[#2fd6b5]/35"
              href="/"
            >
              Back to LoopTalk
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
