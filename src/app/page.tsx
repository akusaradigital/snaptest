"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import UserMenu from "@/components/UserMenu";
import {
  Layers,
  Zap,
  ListChecks,
  Code2,
  Activity,
  MousePointerClick,
  Check,
  ArrowRight,
  FileSpreadsheet,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  ClipboardList,
  ContactRound,
  Globe2,
  Database,
  BookOpen,
  LayoutGrid,
} from "lucide-react";

function GoogleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: <ListChecks className="w-5 h-5" />,
    title: "AI Test Cases",
    desc: "Crawl any page and get structured, prioritized test cases.",
    points: ["Positive, negative, edge & security paths", "Priority & type auto-assigned", "Clean markdown table you can export"],
  },
  {
    icon: <Code2 className="w-5 h-5" />,
    title: "Automation Scripts",
    desc: "Turn each case into ready-to-run automation code.",
    points: ["Playwright, Cypress & Selenium", "TypeScript, Python, Java & more", "Download all as a ZIP"],
  },
  {
    icon: <MousePointerClick className="w-5 h-5" />,
    title: "Selector Playground",
    desc: "Validate CSS selectors against a live page.",
    points: ["See exactly what matches", "Catch fragile selectors early", "No setup required"],
  },
  {
    icon: <Activity className="w-5 h-5" />,
    title: "Selector Monitor",
    desc: "Track selectors over time as pages change.",
    points: ["Healthy / warning / broken status", "Snapshot history per URL", "Know before your tests do"],
  },
];

const CAPABILITIES = [
  { icon: <Zap className="h-5 w-5" />, title: "Test Case Agent", desc: "URL, screenshot, or test goal" },
  { icon: <ContactRound className="h-5 w-5" />, title: "Issue & Ticket Agent", desc: "Bug reports, Drive links, screenshots" },
  { icon: <Globe2 className="h-5 w-5" />, title: "API Test Agent", desc: "cURL, OpenAPI, Postman collections" },
  { icon: <BookOpen className="h-5 w-5" />, title: "Test Planner", desc: "PRDs, user stories, Gherkin" },
  { icon: <Database className="h-5 w-5" />, title: "Data Generator", desc: "JSON schemas and field constraints" },
];

const STEPS = [
  { n: "01", title: "Paste a URL", desc: "Point SnapTest at any page you want to test - login forms, dashboards, checkout flows." },
  { n: "02", title: "Bring your AI key", desc: "Pick OpenAI, Claude, Gemini, Groq, DeepSeek and more. Your key stays in your browser." },
  { n: "03", title: "Generate & export", desc: "Get test cases and runnable scripts in seconds. Copy, download, or run them." },
];

const STRENGTHS = [
  {
    icon: <TerminalSquare className="h-5 w-5" />,
    title: "Multi-framework output",
    desc: "Playwright, Cypress, Selenium — TypeScript, Python, Java. Pick the combo you actually use.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Keys never leave your browser",
    desc: "Your AI API keys stay in local storage and go straight to your provider. We never see or store them.",
  },
  {
    icon: <LayoutGrid className="h-5 w-5" />,
    title: "End-to-end QA workflow",
    desc: "Requirements, test cases, scripts, API tests, data, and Jira tickets — one workspace, five agents.",
  },
  {
    icon: <ClipboardList className="h-5 w-5" />,
    title: "Export anywhere",
    desc: "XLSX, CSV, Postman collections, Gherkin, ZIP archives, and clean markdown for your reporting.",
  },
];

const PROVIDERS = [
  { name: "OpenAI", icon: "/logos/openai.svg" },
  { name: "Claude", icon: "/logos/claude.svg" },
  { name: "Gemini", icon: "/logos/gemini.svg" },
  { name: "Groq", icon: "/logos/groq.png", iconBg: "bg-[#f43d00]" },
  { name: "DeepSeek", icon: "/logos/deepseek.svg" },
  { name: "Moonshot", icon: "/logos/moonshot.svg" },
  { name: "Qwen", icon: "/logos/qwen.svg" },
  { name: "9Router", icon: "/logos/9router.svg", iconBg: "bg-[#f97316]" },
];

const FAQ = [
  {
    q: "Do I need to pay for anything?",
    a: "SnapTest requires Google sign-in to generate test suites and save your history. You bring your own AI provider key, so you only pay your AI provider directly.",
  },
  {
    q: "Where are my API keys stored?",
    a: "In your browser's local storage only. Keys are forwarded per request to your chosen AI provider and never saved on our servers.",
  },
  {
    q: "Which frameworks and languages are supported?",
    a: "Playwright, Cypress and Selenium across TypeScript, JavaScript, Python and Java - pick the combo you actually use.",
  },
  {
    q: "Does it work on JavaScript-heavy sites?",
    a: "It reads server-rendered HTML, so static and SSR pages work best. Single-page apps that render everything client-side may expose fewer elements.",
  },
];

export default function Landing() {
  const { data: session, status } = useSession();

  const ctaHref = session ? "/dashboard" : "/login?callbackUrl=/dashboard";
  const ctaLabel = session ? "Go to App" : "Sign in with Google";
  const ctaIcon = session ? <Zap className="h-4 w-4" /> : <GoogleIcon />;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-500/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight">SnapTest</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
            <a href="#solutions" className="transition hover:text-slate-900">Solutions</a>
            <a href="#features" className="transition hover:text-slate-900">Features</a>
            <a href="#how" className="transition hover:text-slate-900">How it works</a>
            <a href="#faq" className="transition hover:text-slate-900">FAQ</a>
          </nav>
          <div className="flex items-center justify-end"><UserMenu /></div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-[420px] bg-slate-50" />
          <div className="absolute -top-24 left-1/2 h-[380px] w-[760px] -translate-x-1/2 rounded-full bg-indigo-100/50 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-14 text-center sm:px-8 sm:pt-20">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-medium text-indigo-600 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered QA workspace
          </div>

          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            Test cases &amp; automation scripts,{" "}
            <span className="text-indigo-600">
              generated by AI
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-500">
            Paste a URL, choose your AI provider, and get structured test cases plus runnable
            Playwright, Cypress or Selenium scripts — in seconds.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 min-h-11 sm:flex-row">
            {status !== "loading" && (
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
              >
                {ctaIcon}
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-7 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              See what it does
            </a>
          </div>

          <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Keys stay in your browser</span>
            <span className="inline-flex items-center gap-1.5"><TerminalSquare className="h-3.5 w-3.5 text-sky-500" /> Playwright · Cypress · Selenium</span>
            <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-amber-500" /> Export XLSX · CSV · Postman</span>
          </div>

          {/* Outcome preview — what you get, not how it looks */}
          <div className="mt-14 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
            <div className="grid items-stretch lg:grid-cols-[1.2fr_1fr]">
              {/* Result stats */}
              <div className="flex flex-col justify-center border-b border-slate-100 p-8 lg:border-b-0 lg:border-r sm:p-10">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">One click on a URL</p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  From page to test suite in seconds
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  SnapTest crawls the page, maps the flows, and generates structured test cases with
                  priorities, scripts, and export files — before your coffee cools.
                </p>
                <dl className="mt-8 grid grid-cols-3 gap-6">
                  <div>
                    <dd className="text-3xl font-bold text-indigo-600">5</dd>
                    <dt className="mt-1 text-xs text-slate-500">AI agents in one workspace</dt>
                  </div>
                  <div>
                    <dd className="text-3xl font-bold text-indigo-600">3</dd>
                    <dt className="mt-1 text-xs text-slate-500">frameworks: Playwright, Cypress, Selenium</dt>
                  </div>
                  <div>
                    <dd className="text-3xl font-bold text-indigo-600">0</dd>
                    <dt className="mt-1 text-xs text-slate-500">API keys stored on our servers</dt>
                  </div>
                </dl>
                <div className="mt-8 min-h-11">
                  {status !== "loading" && (
                    <Link
                      href={ctaHref}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
                    >
                      {ctaIcon}
                      {ctaLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>

              {/* Result card stack */}
              <div className="flex flex-col gap-4 bg-slate-50 p-8 sm:p-10">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <FileSpreadsheet className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">test-cases.xlsx</p>
                        <p className="text-xs text-slate-400">12 test cases · 4 priority levels</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Ready</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <span className="rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-700">✓ 4 Happy path</span>
                    <span className="rounded-lg bg-red-50 px-3 py-2 font-medium text-red-700">✕ 3 Negative</span>
                    <span className="rounded-lg bg-blue-50 px-3 py-2 font-medium text-blue-700">⇄ 3 Edge cases</span>
                    <span className="rounded-lg bg-rose-50 px-3 py-2 font-medium text-rose-700">⛨ 2 Security</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <TerminalSquare className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">login.spec.ts</p>
                        <p className="text-xs text-slate-400">Playwright · TypeScript</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">Ready</span>
                  </div>
                  <p className="mt-4 truncate rounded-lg bg-slate-900 px-3 py-2.5 font-mono text-xs text-slate-300">
                    test("valid login redirects to dashboard", async (page) =&gt; ...
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <ContactRound className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">BUG-1042</p>
                        <p className="text-xs text-slate-400">Jira ticket drafted from the failure</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">Draft</span>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-slate-500">
                    Login form does not show validation on empty password. AI drafted the ticket — review, push to Jira, done.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Providers */}
          <div className="mt-14">
            <p className="mb-4 text-xs uppercase tracking-wider text-slate-400">Works with your favourite models</p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {PROVIDERS.map((p) => (
                <span key={p.name} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${p.iconBg || "bg-slate-100"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.icon} alt="" className="h-3.5 w-3.5 object-contain" loading="lazy" />
                  </span>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Solutions / capabilities */}
      <section id="solutions" className="scroll-mt-20 border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">One workspace for the whole QA loop</h2>
            <p className="mt-4 text-slate-500">From requirements to issues — five AI agents, one place.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {CAPABILITIES.map((cap) => (
              <div key={cap.title} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{cap.icon}</div>
                <h3 className="mt-4 font-semibold text-slate-900">{cap.title}</h3>
                <p className="mt-1.5 text-sm text-slate-500">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to ship tests faster</h2>
          <p className="mt-4 text-slate-500">From discovery to runnable code, in one place.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{f.icon}</div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
              </div>
              <p className="mt-3 text-sm text-slate-500">{f.desc}</p>
              <ul className="mt-4 space-y-2">
                {f.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Why SnapTest / strengths */}
      <section className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Built for QA teams who ship</h2>
            <p className="mt-4 text-slate-500">Practical advantages that make AI testing actually usable.</p>
          </div>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {STRENGTHS.map((s) => (
              <div key={s.title} className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
                  {s.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
          <p className="mt-4 text-slate-500">Three steps from URL to a working test suite.</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-md shadow-indigo-500/20">
                  {i + 1}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-indigo-600 p-10 text-center shadow-xl shadow-indigo-600/20 sm:p-14">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-64 w-[480px] -translate-x-1/2 rounded-full bg-white/15 blur-3xl" />
          <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">Ship tests faster, starting today</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-indigo-100">
            Sign in once and bring your own AI key. Generate test cases, scripts, and tickets in seconds — your key never leaves your browser.
          </p>
          <div className="relative mt-8 min-h-11">
            {status !== "loading" && (
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-indigo-700 shadow-lg transition hover:bg-indigo-50"
              >
                {ctaIcon}
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 pb-16 pt-16 sm:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm open:shadow-md">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-800">
                {item.q}
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-5 py-8 text-center text-sm text-slate-400 sm:px-8">
          Powered @akusaraproject
        </div>
      </footer>
    </div>
  );
}