import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-200 py-12 px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 p-8 sm:p-12 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
            <p className="text-xs text-slate-500">Effective Date: January 1, 2025</p>
          </div>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">1. Overview</h2>
            <p>SnapTest ("we", "our", or "us") provides AI-powered QA test scenario generation and ticket management tools. We respect your privacy and are committed to protecting any data processed through our application.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">2. Zero Server-Side Secret Storage</h2>
            <p>All third-party AI provider API keys and Jira credentials configured by users are stored strictly in client-side browser storage (<code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">localStorage</code>) and are never permanently persisted in our application databases.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">3. Jira & Third-Party Integrations</h2>
            <p>When connecting with Atlassian Jira Cloud via OAuth 2.0, tokens are utilized solely to interact with Jira APIs on your direct instruction (such as fetching projects and publishing issue tickets). We do not scrape, sell, or monetize any data retrieved from your Jira workspace.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">4. Data Security</h2>
            <p>All communication between your browser and our servers occurs over encrypted HTTPS connections. We maintain industry standard technical and organizational measures to safeguard data.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">5. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact our support team at <a href="mailto:support@akusaraproject.my.id" className="text-indigo-600 underline">support@akusaraproject.my.id</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
