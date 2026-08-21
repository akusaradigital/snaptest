"use client";

import { useState, useEffect } from "react";
import AISettings from "@/components/AISettings";
import TeamSettings from "@/components/TeamSettings";
import { FileText, Users, Share2, Check, Loader2, Cpu } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";
import { ModelsResponse } from "@/types";

interface SettingsPageProps {
  onProviderChange: (provider: string, model: string) => void;
  selectedProvider: string;
  selectedModel: string;
  modelsData: ModelsResponse | null;
  refreshModels: () => Promise<void>;
}

type SettingSection = "ai" | "generation" | "workspace" | "integrations";

const SECTIONS: { id: SettingSection; label: string; description: string }[] = [
  { id: "ai", label: "AI & Models", description: "Connect your API keys and pick the model for AI-powered test generation." },
  { id: "generation", label: "Generation", description: "Tune the prompt SnapTest uses when generating test cases." },
  { id: "workspace", label: "Workspace", description: "Share test history with members of your team." },
  { id: "integrations", label: "Integrations", description: "Connect Atlassian Jira Cloud or Aksora to push tickets to your backlog." },
];

export default function SettingsPage({
  onProviderChange,
  selectedProvider,
  selectedModel,
  modelsData,
  refreshModels,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingSection>("ai");

  const [customPrompt, setCustomPrompt] = useState("");

  // Jira config state
  const [jiraDomain, setJiraDomain] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [testingJira, setTestingJira] = useState(false);
  const [savedJira, setSavedJira] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);

  // Aksora config state
  const [aksoraUrl, setAksoraUrl] = useState("");
  const [aksoraKey, setAksoraKey] = useState("");
  const [testingAksora, setTestingAksora] = useState(false);
  const [savedAksora, setSavedAksora] = useState(false);
  const [aksoraConnected, setAksoraConnected] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const savedPrompt = localStorage.getItem("snaptest_settings");
    if (savedPrompt) {
      try {
        const parsed = JSON.parse(savedPrompt);
        setCustomPrompt(parsed.customPrompt || "");
      } catch { /* ignore */ }
    }

    const savedJira = localStorage.getItem("jira_config");
    if (savedJira) {
      try {
        const parsed = JSON.parse(savedJira);
        setJiraDomain(parsed.domain || "");
        setJiraEmail(parsed.email || "");
        setJiraToken(parsed.token || "");
        setJiraProjectKey(parsed.project_key || "");
        setJiraConnected(!!(parsed.domain && parsed.email && parsed.token && parsed.project_key));
      } catch { /* ignore */ }
    }

    const savedAksora = localStorage.getItem("aksora_config");
    if (savedAksora) {
      try {
        const parsed = JSON.parse(savedAksora);
        setAksoraUrl(parsed.url || "");
        setAksoraKey(parsed.apiKey || "");
        setAksoraConnected(!!(parsed.apiKey && parsed.url));
      } catch { /* ignore */ }
    }
  }, []);

  const handleSaveJira = () => {
    localStorage.setItem(
      "jira_config",
      JSON.stringify({
        domain: jiraDomain.trim(),
        email: jiraEmail.trim(),
        token: jiraToken.trim(),
        project_key: jiraProjectKey.trim().toUpperCase(),
      })
    );
    setSavedJira(true);
    setJiraConnected(!!(jiraDomain && jiraEmail && jiraToken && jiraProjectKey));
    setTimeout(() => setSavedJira(false), 2000);
    toast.success("Jira settings saved in this browser");
  };

  const handleClearJira = () => {
    if (!window.confirm("Disconnect Jira? This removes the saved domain, email, token, and project key from this browser.")) return;
    localStorage.removeItem("jira_config");
    setJiraDomain("");
    setJiraEmail("");
    setJiraToken("");
    setJiraProjectKey("");
    setJiraConnected(false);
    toast.success("Jira integration disconnected");
  };

  const handleSaveAksora = () => {
    if (!aksoraUrl.trim()) {
      toast.error("Please enter the Aksora Base URL first");
      return;
    }
    localStorage.setItem(
      "aksora_config",
      JSON.stringify({
        url: aksoraUrl.trim(),
        apiKey: aksoraKey.trim(),
      })
    );
    setSavedAksora(true);
    setAksoraConnected(!!aksoraKey.trim());
    setTimeout(() => setSavedAksora(false), 2000);
    toast.success("Aksora settings saved in this browser");
  };

  const handleClearAksora = () => {
    if (!window.confirm("Disconnect Aksora? This removes the saved URL and API key from this browser.")) return;
    localStorage.removeItem("aksora_config");
    setAksoraUrl("");
    setAksoraKey("");
    setAksoraConnected(false);
    toast.success("Aksora integration disconnected");
  };

  const handleTestAksora = async () => {
    if (!aksoraUrl.trim()) {
      toast.error("Please enter the Aksora Base URL first");
      return;
    }
    if (!aksoraKey) {
      toast.error("Please enter an Aksora API Key first");
      return;
    }
    setTestingAksora(true);
    try {
      const res = await axios.post("/api/aksora/test", {
        url: aksoraUrl.trim(),
        apiKey: aksoraKey.trim(),
      });
      if (res.data.valid) {
        toast.success("Connected to Aksora API successfully!");
        handleSaveAksora();
      } else {
        toast.error(res.data.detail || "Aksora authentication failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || "Failed to connect to Aksora API");
    } finally {
      setTestingAksora(false);
    }
  };

  const handleTestJira = async () => {
    if (!jiraDomain || !jiraEmail || !jiraToken) {
      toast.error("Please fill Domain, Email, and Token first");
      return;
    }
    setTestingJira(true);
    try {
      const res = await axios.post("/api/jira/test", {
        domain: jiraDomain.trim(),
        email: jiraEmail.trim(),
        token: jiraToken.trim(),
      });
      if (res.data.valid) {
        toast.success(`Connected to Jira as ${res.data.displayName}!`);
        handleSaveJira();
      } else {
        toast.error(res.data.detail || "Jira authentication failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || "Failed to connect to Jira");
    } finally {
      setTestingJira(false);
    }
  };

  const saveSettings = (key: string, value: any) => {
    const savedVal = localStorage.getItem("snaptest_settings");
    const current = savedVal ? JSON.parse(savedVal) : {};
    current[key] = value;
    localStorage.setItem("snaptest_settings", JSON.stringify(current));
  };

  const handleSavePrompt = () => {
    saveSettings("customPrompt", customPrompt);
    toast.success("Custom prompt saved");
  };

  const active = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="border-b border-slate-200 pb-5 dark:border-slate-700">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Settings</h1>
        <p className="mt-2 text-sm text-slate-500">Manage providers, generation behavior, workspace, and integrations.</p>
      </header>

      <div className="flex min-h-0 flex-col gap-0 lg:flex-row lg:gap-10">
        {/* Section navigation */}
        <nav className="shrink-0 border-b border-slate-200 py-3 lg:w-56 lg:border-b-0 lg:py-6 lg:pr-4" aria-label="Settings sections">
          <ul className="flex flex-col gap-1">
            {SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isActive
                        ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {section.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Active section */}
        <main className="min-w-0 flex-1 py-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{active.label}</h2>
            <p className="mt-1 text-sm text-slate-500">{active.description}</p>
          </div>

          {activeSection === "ai" && (
            <AISettings
              onProviderChange={onProviderChange}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              modelsData={modelsData}
              refreshModels={refreshModels}
              inline
            />
          )}

          {activeSection === "generation" && (
            <section className="max-w-2xl">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Custom Prompt Template</h3>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Extra instructions appended to the AI prompt when generating test cases.
              </p>
              <textarea
                rows={8}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. Always use page.getByTestId() instead of classes. Ensure all tests run in parallel. Add accessibility checks."
                className="input-field mt-4 resize-y text-sm"
              />
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={handleSavePrompt} className="btn-primary text-xs">
                  Save Prompt
                </button>
              </div>
            </section>
          )}

          {activeSection === "workspace" && (
            <section className="max-w-2xl">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Team Workspace</h3>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Share test history with your team. All members see each other&apos;s generated results.
              </p>
              <div className="mt-4">
                <TeamSettings />
              </div>
            </section>
          )}

          {activeSection === "integrations" && (
            <section className="max-w-2xl">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Jira Cloud Integration</h3>
                {jiraConnected && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Connect your Atlassian Jira Cloud workspace to push AI-generated tickets directly to your backlog.
              </p>

              <div className="mt-6 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Jira Domain</label>
                  <input
                    type="text"
                    value={jiraDomain}
                    onChange={(e) => setJiraDomain(e.target.value)}
                    placeholder="example.atlassian.net"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Atlassian Account Email</label>
                  <input
                    type="email"
                    value={jiraEmail}
                    onChange={(e) => setJiraEmail(e.target.value)}
                    placeholder="qa@company.com"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">API Token</label>
                  <input
                    type="password"
                    value={jiraToken}
                    onChange={(e) => setJiraToken(e.target.value)}
                    placeholder="ATATT3xFfGF0..."
                    className="input-field font-mono text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Generate token at{" "}
                    <a
                      href="https://id.atlassian.com/manage-profile/security/api-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 underline"
                    >
                      id.atlassian.com
                    </a>{" "}
                    · Stored in this browser only.
                  </p>
                  {jiraConnected && (
                    <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">✓ Token saved in this browser (hidden)</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Default Project Key</label>
                  <input
                    type="text"
                    value={jiraProjectKey}
                    onChange={(e) => setJiraProjectKey(e.target.value)}
                    placeholder="QA or PROJ"
                    className="input-field font-mono text-sm uppercase"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handleTestJira}
                  disabled={testingJira}
                  className="btn-secondary flex items-center gap-1.5 text-xs"
                >
                  {testingJira ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {testingJira ? "Testing..." : "Test Connection"}
                </button>
                <button type="button" onClick={handleSaveJira} className="btn-primary flex items-center gap-1.5 text-xs">
                  {savedJira ? <Check className="h-3.5 w-3.5" /> : null}
                  {savedJira ? "Saved" : "Save Jira Settings"}
                </button>
                {jiraConnected && (
                  <button type="button" onClick={handleClearJira} className="btn-secondary text-xs text-red-600 hover:text-red-700">
                    Disconnect
                  </button>
                )}
              </div>

              {/* Aksora Integration */}
              <div className="mt-10 flex items-center gap-2">
                <Share2 className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Aksora Integration</h3>
                {aksoraConnected && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Connect your Aksora workspace to sync AI-generated bugs, tasks, and test cases directly to Aksora.
              </p>

              <div className="mt-6 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Aksora Base URL</label>
                  <input
                    type="text"
                    value={aksoraUrl}
                    onChange={(e) => setAksoraUrl(e.target.value)}
                    placeholder="https://aksora.com (or http://localhost:3000 for local)"
                    className="input-field text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    The root URL of your Aksora instance where the API is hosted.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">API Key</label>
                  <input
                    type="password"
                    value={aksoraKey}
                    onChange={(e) => setAksoraKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                    className="input-field font-mono text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Generate an API Key from Aksora under Settings &gt; API Keys.
                  </p>
                  {aksoraConnected && (
                    <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">✓ Key saved in this browser (hidden)</p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handleTestAksora}
                  disabled={testingAksora}
                  className="btn-secondary flex items-center gap-1.5 text-xs"
                >
                  {testingAksora ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {testingAksora ? "Testing..." : "Test Connection"}
                </button>
                <button type="button" onClick={handleSaveAksora} className="btn-primary flex items-center gap-1.5 text-xs">
                  {savedAksora ? <Check className="h-3.5 w-3.5" /> : null}
                  {savedAksora ? "Saved" : "Save Aksora Settings"}
                </button>
                {aksoraConnected && (
                  <button type="button" onClick={handleClearAksora} className="btn-secondary text-xs text-red-600 hover:text-red-700">
                    Disconnect
                  </button>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}