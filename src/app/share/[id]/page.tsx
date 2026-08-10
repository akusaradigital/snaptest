import { notFound } from "next/navigation";
import ResultsDisplay from "@/components/ResultsDisplay";

export default async function SharePage({ params }: { params: { id: string } }) {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const res = await fetch(`${base}/api/share/${params.id}`, { cache: "no-store" });
  if (!res.ok) notFound();
  const record = await res.json();

  const results = {
    url: record.url,
    page_title: record.page_title,
    elements_found: record.elements_found,
    test_case_table: record.test_case_table,
    test_cases: record.test_cases,
    scripts: record.scripts ?? [],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <a href="/" className="text-sm font-bold text-indigo-600">SnapTest</a>
        <span className="text-slate-300">·</span>
        <span className="text-sm text-slate-500">Shared test suite</span>
        <span className="ml-auto text-xs text-slate-400 truncate max-w-xs">{record.url}</span>
      </header>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <ResultsDisplay results={results} />
      </div>
    </div>
  );
}
