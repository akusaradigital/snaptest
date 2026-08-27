import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-200 py-12 px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 p-8 sm:p-12 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Terms of Service</h1>
            <p className="text-xs text-slate-500">Effective Date: January 1, 2025</p>
          </div>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">1. Acceptance of Terms</h2>
            <p>By accessing or using SnapTest, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">2. Description of Service</h2>
            <p>SnapTest provides AI-assisted software quality assurance tools, including test scenario generation, automation script drafting, issue/ticket management, and integrations with third-party tools such as Atlassian Jira Cloud.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">3. User Responsibilities</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials, API keys, and any content generated or submitted through the service. You agree not to use SnapTest for any unlawful or unauthorized purpose.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">4. Third-Party Integrations</h2>
            <p>SnapTest integrates with third-party platforms (including Atlassian Jira Cloud) via OAuth or API tokens explicitly provided by you. Your use of these integrations is also subject to the respective third party terms of service.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">5. Disclaimer of Warranties</h2>
            <p>AI-generated content (test cases, scripts, tickets) is provided &quot;as is&quot; without warranty of any kind. Users should review AI outputs before relying on them for production quality assurance decisions.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">6. Limitation of Liability</h2>
            <p>In no event shall SnapTest or its operators be liable for any indirect, incidental, or consequential damages arising from the use of this service.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">7. Contact Us</h2>
            <p>For questions regarding these Terms, please contact <a href="mailto:support@akusaraproject.my.id" className="text-indigo-600 underline">support@akusaraproject.my.id</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
