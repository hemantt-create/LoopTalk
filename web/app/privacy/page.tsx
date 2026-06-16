import { Home, Lock, Shield } from "lucide-react";
import Link from "next/link";

const privacyItems = [
  "Voice calls are not recorded or stored.",
  "LoopTalk uses microphone access only for live voice chat.",
  "Avoid sharing personal information during conversations.",
];

export default function PrivacyPage() {
  return (
    <main className="neon-shell relative flex min-h-screen overflow-hidden text-[#f7fbff]">
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link
            className="text-xl font-black tracking-normal text-white transition hover:text-cyan-100"
            href="/"
          >
            LoopTalk
          </Link>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-200 transition hover:text-white"
            href="/safety"
          >
            <Shield aria-hidden="true" className="size-4" />
            Safety
          </Link>
        </header>

        <div className="flex flex-1 items-center py-12">
          <div className="w-full">
            <p className="glass-pill mb-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-cyan-100">
              <Lock aria-hidden="true" className="size-4" />
              Privacy
            </p>
            <h1 className="text-4xl font-black tracking-normal text-white sm:text-5xl">
              Simple privacy for live voice chat.
            </h1>
            <div className="glass-panel state-surface mt-8 rounded-lg p-5">
              <ul className="grid gap-4">
                {privacyItems.map((item) => (
                  <li key={item} className="flex gap-3 text-slate-300">
                    <Lock
                      aria-hidden="true"
                      className="mt-1 size-5 shrink-0 text-cyan-300"
                    />
                    <span className="text-base font-semibold leading-7">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              className="neon-primary mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-cyan-300/25"
              href="/"
            >
              <Home aria-hidden="true" className="size-4" />
              Back to LoopTalk
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
