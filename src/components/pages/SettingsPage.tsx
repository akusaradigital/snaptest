"use client";

import { useState, useEffect } from "react";
import AISettings from "@/components/AISettings";
import TeamSettings from "@/components/TeamSettings";
import {
  FileText,
  Users,
  Share2,
  Check,
  Loader2,
  ExternalLink,
  Unlink,
  CheckCircle2,
  ArrowLeft,
  Search,
  Sliders,
  Sparkles,
} from "lucide-react";
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
type IntegrationId = "jira" | "aksora" | "sheets";

const SECTIONS: { id: SettingSection; label: string; description: string }[] = [
  { id: "ai", label: "AI & Models", description: "Connect your API keys and pick the model for AI-powered test generation." },
  { id: "generation", label: "Generation", description: "Tune the prompt SnapTest uses when generating test cases." },
  { id: "workspace", label: "Workspace", description: "Share test history with members of your team." },
  { id: "integrations", label: "Integrations", description: "Connect issue trackers and backlog tools to push AI-generated tickets." },
];

export default function SettingsPage({
  onProviderChange,
  selectedProvider,
  selectedModel,
  modelsData,
  refreshModels,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingSection>("ai");
  const [activeIntegrationDetail, setActiveIntegrationDetail] = useState<IntegrationId | null>(null);
  const [integrationSearch, setIntegrationSearch] = useState("");

  const [customPrompt, setCustomPrompt] = useState("");
  const [ticketCustomPrompt, setTicketCustomPrompt] = useState("");

  // Jira config state
  const [jiraAuthType, setJiraAuthType] = useState<"oauth2" | "pat">("oauth2");
  const [jiraAccessToken, setJiraAccessToken] = useState("");
  const [jiraCloudId, setJiraCloudId] = useState("");
  const [jiraSiteName, setJiraSiteName] = useState("");
  const [jiraDomain, setJiraDomain] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("BUG");
  const [testingJira, setTestingJira] = useState(false);
  const [savedJira, setSavedJira] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);

  // Aksora config state
  const [aksoraUrl, setAksoraUrl] = useState("");
  const [aksoraKey, setAksoraKey] = useState("");
  const [testingAksora, setTestingAksora] = useState(false);
  const [savedAksora, setSavedAksora] = useState(false);
  const [aksoraConnected, setAksoraConnected] = useState(false);

  // Google Sheets config state
  const [sheetsWebhookUrl, setSheetsWebhookUrl] = useState("");
  const [sheetsSpreadsheetUrl, setSheetsSpreadsheetUrl] = useState("");
  const [sheetsTabName, setSheetsTabName] = useState("QA Tickets");
  const [testingSheets, setTestingSheets] = useState(false);
  const [savedSheets, setSavedSheets] = useState(false);
  const [sheetsConnected, setSheetsConnected] = useState(false);
  const [hideInactiveIntegrations, setHideInactiveIntegrations] = useState(true);

  // Check URL params for OAuth results
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const tabParam = url.searchParams.get("tab");
    if (tabParam === "integrations") {
      setActiveSection("integrations");
    }
    if (url.searchParams.get("jira_connected")) {
      setActiveSection("integrations");
      setActiveIntegrationDetail("jira");
      toast.success("Jira Cloud connected successfully via OAuth!");
      url.searchParams.delete("jira_connected");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }
    const oauthError = url.searchParams.get("jira_oauth_error");
    if (oauthError) {
      setActiveSection("integrations");
      setActiveIntegrationDetail("jira");
      toast.error(`Jira connection failed: ${oauthError}`);
      url.searchParams.delete("jira_oauth_error");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }
  }, []);

  // Load settings from localStorage
  useEffect(() => {
    const savedPrompt = localStorage.getItem("snaptest_settings");
    if (savedPrompt) {
      try {
        const parsed = JSON.parse(savedPrompt);
        setCustomPrompt(parsed.customPrompt || "");
        setTicketCustomPrompt(parsed.ticketCustomPrompt || "");
        if (parsed.hideInactiveIntegrations !== undefined) {
          setHideInactiveIntegrations(parsed.hideInactiveIntegrations);
        }
      } catch { /* ignore */ }
    }

    const savedJiraConfig = localStorage.getItem("jira_config");
    if (savedJiraConfig) {
      try {
        const parsed = JSON.parse(savedJiraConfig);
        setJiraAuthType(parsed.auth_type || (parsed.access_token ? "oauth2" : "pat"));
        setJiraAccessToken(parsed.access_token || "");
        setJiraCloudId(parsed.cloud_id || "");
        setJiraSiteName(parsed.site_name || "");
        setJiraDomain(parsed.domain || "");
        setJiraEmail(parsed.email || "");
        setJiraToken(parsed.token || "");
        setJiraProjectKey(parsed.project_key || "BUG");
        setJiraConnected(!!((parsed.access_token && parsed.cloud_id) || (parsed.domain && parsed.email && parsed.token)));
      } catch { /* ignore */ }
    }

    const savedAksoraConfig = localStorage.getItem("aksora_config");
    if (savedAksoraConfig) {
      try {
        const parsed = JSON.parse(savedAksoraConfig);
        setAksoraUrl(parsed.url || "");
        setAksoraKey(parsed.apiKey || "");
        setAksoraConnected(!!(parsed.apiKey && parsed.url));
      } catch { /* ignore */ }
    }

    const savedSheetsConfig = localStorage.getItem("sheets_config");
    if (savedSheetsConfig) {
      try {
        const parsed = JSON.parse(savedSheetsConfig);
        setSheetsWebhookUrl(parsed.webhook_url || "");
        setSheetsSpreadsheetUrl(parsed.sheet_url || "");
        setSheetsTabName(parsed.sheet_name || "QA Tickets");
        setSheetsConnected(!!parsed.webhook_url);
      } catch { /* ignore */ }
    }
  }, []);

  const handleExportBackup = () => {
    const backup = {
      version: 1,
      snaptest_api_keys: localStorage.getItem("snaptest_api_keys"),
      nine_router_public: localStorage.getItem("9router_public"),
      snaptest_selected_provider_model: localStorage.getItem("snaptest_selected_provider_model"),
      snaptest_settings: localStorage.getItem("snaptest_settings"),
      jira_config: localStorage.getItem("jira_config"),
      aksora_config: localStorage.getItem("aksora_config"),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `snaptest-settings-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Settings exported");
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        for (const key of ["snaptest_api_keys", "nine_router_public", "snaptest_selected_provider_model", "snaptest_settings", "jira_config", "aksora_config"]) {
          const storageKey = key === "nine_router_public" ? "9router_public" : key;
          if (typeof data[key] === "string") localStorage.setItem(storageKey, data[key]);
        }
        toast.success("Settings imported. Reloading...");
        setTimeout(() => window.location.reload(), 500);
      } catch {
        toast.error("Failed to parse backup file");
      }
    };
    reader.readAsText(file);
  };

  const handleProjectKeyChange = (val: string) => {
    const upper = val.toUpperCase();
    setJiraProjectKey(upper);
    const existing = JSON.parse(localStorage.getItem("jira_config") || "{}");
    localStorage.setItem("jira_config", JSON.stringify({ ...existing, project_key: upper.trim() }));
  };

  const handleSaveJira = () => {
    const existing = JSON.parse(localStorage.getItem("jira_config") || "{}");
    const updated = {
      ...existing,
      auth_type: jiraAuthType,
      domain: jiraDomain.trim(),
      email: jiraEmail.trim(),
      token: jiraToken.trim(),
      project_key: jiraProjectKey.trim().toUpperCase(),
      access_token: jiraAccessToken,
      cloud_id: jiraCloudId,
      site_name: jiraSiteName,
    };
    localStorage.setItem("jira_config", JSON.stringify(updated));
    setSavedJira(true);
    setJiraConnected(!!((jiraAccessToken && jiraCloudId) || (jiraDomain && jiraEmail && jiraToken)));
    setTimeout(() => setSavedJira(false), 2000);
    toast.success("Jira settings saved");
  };

  const handleDisconnectJira = () => {
    localStorage.removeItem("jira_config");
    setJiraAccessToken("");
    setJiraCloudId("");
    setJiraSiteName("");
    setJiraDomain("");
    setJiraEmail("");
    setJiraToken("");
    setJiraProjectKey("BUG");
    setJiraConnected(false);
    toast.success("Disconnected from Jira");
  };

  const handleTestJira = async () => {
    setTestingJira(true);
    try {
      const res = await axios.post("/api/jira/test", {
        auth_type: jiraAuthType,
        access_token: jiraAccessToken,
        cloud_id: jiraCloudId,
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

  const handleSaveAksora = () => {
    localStorage.setItem(
      "aksora_config",
      JSON.stringify({
        url: aksoraUrl.trim().replace(/\/$/, ""),
        apiKey: aksoraKey.trim(),
      })
    );
    setSavedAksora(true);
    setAksoraConnected(!!(aksoraUrl && aksoraKey));
    setTimeout(() => setSavedAksora(false), 2000);
    toast.success("Aksora settings saved in this browser");
  };

  const handleClearAksora = () => {
    localStorage.removeItem("aksora_config");
    setAksoraUrl("");
    setAksoraKey("");
    setAksoraConnected(false);
    toast.success("Aksora disconnected");
  };

  const handleTestAksora = async () => {
    if (!aksoraUrl || !aksoraKey) {
      toast.error("Please fill Aksora Base URL and API Key first");
      return;
    }
    setTestingAksora(true);
    try {
      const res = await axios.post("/api/aksora/test", {
        url: aksoraUrl.trim().replace(/\/$/, ""),
        apiKey: aksoraKey.trim(),
      });
      if (res.data.valid) {
        toast.success(`Connected to Aksora as ${res.data.userName || res.data.userEmail || "User"}!`);
        handleSaveAksora();
      } else {
        toast.error(res.data.detail || "Aksora authentication failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || "Failed to connect to Aksora");
    } finally {
      setTestingAksora(false);
    }
  };

  const handleSaveSheets = () => {
    localStorage.setItem(
      "sheets_config",
      JSON.stringify({
        webhook_url: sheetsWebhookUrl.trim(),
        sheet_url: sheetsSpreadsheetUrl.trim(),
        sheet_name: sheetsTabName.trim() || "QA Tickets",
      })
    );
    setSavedSheets(true);
    setSheetsConnected(!!sheetsWebhookUrl.trim());
    setTimeout(() => setSavedSheets(false), 2000);
    toast.success("Google Sheets configuration saved");
  };

  const handleClearSheets = () => {
    localStorage.removeItem("sheets_config");
    setSheetsWebhookUrl("");
    setSheetsSpreadsheetUrl("");
    setSheetsTabName("QA Tickets");
    setSheetsConnected(false);
    toast.success("Google Sheets disconnected");
  };

  const handleTestSheets = async () => {
    if (!sheetsWebhookUrl) {
      toast.error("Please enter your Google Sheets Webhook URL first");
      return;
    }
    setTestingSheets(true);
    try {
      const res = await axios.post("/api/sheets/test", {
        webhook_url: sheetsWebhookUrl.trim(),
      });
      if (res.data.valid) {
        toast.success(res.data.message || "Connected to Google Spreadsheet!");
        handleSaveSheets();
      } else {
        toast.error(res.data.detail || "Spreadsheet webhook test failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || "Failed to connect to Google Sheets webhook");
    } finally {
      setTestingSheets(false);
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
    toast.success("Custom test prompt saved");
  };

  const handleSaveTicketPrompt = () => {
    saveSettings("ticketCustomPrompt", ticketCustomPrompt);
    toast.success("Custom ticket agent prompt saved");
  };

  const active = SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0];

  const integrationList = [
    {
      id: "jira" as IntegrationId,
      name: "Jira Cloud",
      description: "Create structured tickets, bugs, and tasks with full steps to reproduce directly to your backlog.",
      connected: jiraConnected,
      badge: jiraAccessToken ? "OAuth 2.0" : jiraConnected ? "API Token" : null,
      icon: (
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#0052CC]" fill="currentColor">
          <path d="M11.53 2c0 2.4-1.97 4.35-4.4 4.35H2.8v4.33h4.33c2.4 0 4.4 1.95 4.4 4.35v6.97h4.34v-6.97c0-2.4 1.96-4.35 4.36-4.35h4.37V6.35h-4.37c-2.4 0-4.36-1.95-4.36-4.35V2h-4.34z"/>
        </svg>
      ),
    },
    {
      id: "aksora" as IntegrationId,
      name: "Aksora",
      description: "Sync AI-generated bugs, test scenarios, and QA execution records to your Aksora workspace.",
      connected: aksoraConnected,
      badge: aksoraConnected ? "API Key" : null,
      icon: (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-base shadow-sm">
          A
        </div>
      ),
    },
    {
      id: "sheets" as IntegrationId,
      name: "Google Sheets",
      description: "Automatically log and sync all QA issues, bug reports, and test cases directly into a Google Spreadsheet.",
      connected: sheetsConnected,
      badge: sheetsConnected ? "Webhook" : null,
      icon: (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-base shadow-sm">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2zm0 8H7v-2h10v2z"/>
          </svg>
        </div>
      ),
    },
  ];

  const filteredIntegrations = integrationList.filter((item) =>
    item.name.toLowerCase().includes(integrationSearch.toLowerCase()) ||
    item.description.toLowerCase().includes(integrationSearch.toLowerCase())
  );

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
                    onClick={() => {
                      setActiveSection(section.id);
                      setActiveIntegrationDetail(null);
                    }}
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
            <div className="space-y-4">
              <AISettings
                onProviderChange={onProviderChange}
                selectedProvider={selectedProvider}
                selectedModel={selectedModel}
                modelsData={modelsData}
                refreshModels={refreshModels}
                inline
              />
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <label className="btn-secondary cursor-pointer text-xs">
                  Import Settings
                  <input type="file" accept="application/json" className="hidden" onChange={handleImportBackup} />
                </label>
                <button type="button" onClick={handleExportBackup} className="btn-secondary text-xs">
                  Export Settings
                </button>
              </div>
            </div>
          )}

          {activeSection === "generation" && (
            <div className="max-w-2xl space-y-8">
              <section>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Custom Test Case Prompt</h3>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Extra instructions appended to the AI prompt when generating test cases.
                </p>
                <textarea
                  rows={6}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. Always use page.getByTestId() instead of classes. Ensure all tests run in parallel. Add accessibility checks."
                  className="input-field mt-3 resize-y text-sm"
                />
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={handleSavePrompt} className="btn-primary text-xs">
                    Save Test Prompt
                  </button>
                </div>
              </section>

              <section className="pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Issue &amp; Ticket Agent Custom Rules</h3>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Custom rules or guidelines for Jira tickets (e.g. mandatory acceptance criteria rules, prefix naming conventions, priority mappings).
                </p>
                <textarea
                  rows={6}
                  value={ticketCustomPrompt}
                  onChange={(e) => setTicketCustomPrompt(e.target.value)}
                  placeholder="e.g. Always prefix bug titles with '[QA-REVIEW]'. Format acceptance criteria with Gherkin Given-When-Then. Always include team component tags."
                  className="input-field mt-3 resize-y text-sm"
                />
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={handleSaveTicketPrompt} className="btn-primary text-xs">
                    Save Ticket Rules
                  </button>
                </div>
              </section>
            </div>
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
            <section className="max-w-3xl">
              {/* Integration Card View (Default Marketplace-style Grid) */}
              {!activeIntegrationDetail ? (
                <div>
                  <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Connect Apps &amp; Backlogs</h3>
                      <p className="text-xs text-slate-500">Select an integration to configure and push QA artifacts.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={hideInactiveIntegrations}
                          onChange={(e) => {
                            setHideInactiveIntegrations(e.target.checked);
                            saveSettings("hideInactiveIntegrations", e.target.checked);
                            toast.success(e.target.checked ? "Only active integrations shown on tickets" : "All integration options shown on tickets");
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Only show active integrations on tickets</span>
                      </label>
                      <div className="relative w-full sm:w-56">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={integrationSearch}
                          onChange={(e) => setIntegrationSearch(e.target.value)}
                          placeholder="Search apps..."
                          className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-200 placeholder-slate-400"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredIntegrations.map((app) => (
                      <div
                        key={app.id}
                        onClick={() => setActiveIntegrationDetail(app.id)}
                        className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm transition hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md cursor-pointer"
                      >
                        <div>
                          <div className="flex items-start justify-between">
                            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                              {app.icon}
                            </div>
                            {app.connected ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Connected
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                Available
                              </span>
                            )}
                          </div>

                          <div className="mt-4">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition flex items-center gap-2">
                              {app.name}
                              {app.badge && (
                                <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  {app.badge}
                                </span>
                              )}
                            </h4>
                            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                              {app.description}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
                          <span className="text-[11px] font-medium text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                            {app.connected ? "Configure Settings" : "Set up"}
                          </span>
                          <button
                            type="button"
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                              app.connected
                                ? "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                                : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                            }`}
                          >
                            {app.connected ? "Configure" : "Connect"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Detail Configuration View */
                <div>
                  <button
                    type="button"
                    onClick={() => setActiveIntegrationDetail(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-white mb-6 transition"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to All Integrations
                  </button>

                  {activeIntegrationDetail === "jira" && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
                      <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                            <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#0052CC]" fill="currentColor">
                              <path d="M11.53 2c0 2.4-1.97 4.35-4.4 4.35H2.8v4.33h4.33c2.4 0 4.4 1.95 4.4 4.35v6.97h4.34v-6.97c0-2.4 1.96-4.35 4.36-4.35h4.37V6.35h-4.37c-2.4 0-4.36-1.95-4.36-4.35V2h-4.34z"/>
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Atlassian Jira Cloud</h3>
                            <p className="text-xs text-slate-500">Push AI-generated tickets directly to your Jira project backlog.</p>
                          </div>
                        </div>
                        {jiraConnected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Connected
                          </span>
                        )}
                      </div>

                      {/* 1-Click OAuth Card */}
                      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                              1-Click Atlassian OAuth 2.0
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              {jiraAccessToken
                                ? `Connected to ${jiraSiteName || jiraDomain || "Jira Cloud"}`
                                : "Connect with your Atlassian account in one click."}
                            </p>
                          </div>
                          {jiraAccessToken ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleDisconnectJira}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900/40 dark:bg-slate-900 dark:text-rose-400"
                              >
                                <Unlink className="h-3.5 w-3.5" />
                                Disconnect
                              </button>
                            </div>
                          ) : (
                            <a
                              href="/api/jira/oauth/login"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Connect Jira Cloud
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Default Project Key */}
                      <div className="mt-6 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Default Project Key</label>
                          <input
                            type="text"
                            value={jiraProjectKey}
                            onChange={(e) => handleProjectKeyChange(e.target.value)}
                            placeholder="BUG or QA"
                            className="input-field font-mono text-sm uppercase max-w-sm"
                          />
                          <p className="mt-1 text-[11px] text-slate-400">
                            The project code in Jira where new issues will be created (e.g. BUG, QA, PROJ).
                          </p>
                        </div>

                        {/* Manual PAT Fallback Section */}
                        <details className="mt-4 rounded-lg border border-slate-200 p-4 text-xs dark:border-slate-800">
                          <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                            Manual API Token Fallback (Alternative)
                          </summary>
                          <div className="mt-4 space-y-3 max-w-lg">
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
                                </a>
                              </p>
                            </div>
                          </div>
                        </details>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-6 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={handleTestJira}
                          disabled={testingJira}
                          className="btn-secondary flex items-center gap-1.5 text-xs"
                        >
                          {testingJira ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {testingJira ? "Testing..." : "Test Connection"}
                        </button>
                        {!jiraAccessToken && (
                          <button type="button" onClick={handleSaveJira} className="btn-primary flex items-center gap-1.5 text-xs">
                            {savedJira ? <Check className="h-3.5 w-3.5" /> : null}
                            {savedJira ? "Saved" : "Save Jira Settings"}
                          </button>
                        )}
                        {jiraConnected && !jiraAccessToken && (
                          <button type="button" onClick={handleDisconnectJira} className="btn-secondary text-xs text-red-600 hover:text-red-700">
                            Disconnect
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {activeIntegrationDetail === "aksora" && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
                      <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-lg shadow-sm">
                            A
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Aksora Integration</h3>
                            <p className="text-xs text-slate-500">Sync AI-generated bugs, tasks, and test cases directly to Aksora.</p>
                          </div>
                        </div>
                        {aksoraConnected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Connected
                          </span>
                        )}
                      </div>

                      <div className="mt-6 space-y-4 max-w-lg">
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

                      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-6 dark:border-slate-800">
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
                    </div>
                  )}

                  {activeIntegrationDetail === "sheets" && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
                      <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-lg shadow-sm">
                            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2zm0 8H7v-2h10v2z"/>
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Google Sheets Integration</h3>
                            <p className="text-xs text-slate-500">Sync QA bug reports and test tickets directly to a live spreadsheet</p>
                          </div>
                        </div>
                        {sheetsConnected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Connected
                          </span>
                        )}
                      </div>

                      <div className="mt-6 space-y-4 max-w-xl">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Google Apps Script Webhook URL <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="url"
                            value={sheetsWebhookUrl}
                            onChange={(e) => setSheetsWebhookUrl(e.target.value)}
                            placeholder="https://script.google.com/macros/s/.../exec"
                            className="input-field font-mono text-sm"
                          />
                          <p className="mt-1 text-[11px] text-slate-400">
                            Deploy a Google Apps Script Web App (or Integromat / Zapier webhook) that receives JSON to append rows.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Target Sheet / Tab Name
                          </label>
                          <input
                            type="text"
                            value={sheetsTabName}
                            onChange={(e) => setSheetsTabName(e.target.value)}
                            placeholder="QA Tickets"
                            className="input-field text-sm"
                          />
                          <p className="mt-1 text-[11px] text-slate-400">
                            The name of the worksheet/tab where tickets will be recorded.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Google Sheet View Link (Optional)
                          </label>
                          <input
                            type="url"
                            value={sheetsSpreadsheetUrl}
                            onChange={(e) => setSheetsSpreadsheetUrl(e.target.value)}
                            placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                            className="input-field font-mono text-sm"
                          />
                          <p className="mt-1 text-[11px] text-slate-400">
                            Direct URL to quickly open your Google Sheet from the chat bubble.
                          </p>
                        </div>

                        <details className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-xs">
                          <summary className="cursor-pointer font-semibold text-indigo-600 dark:text-indigo-400 flex items-center justify-between">
                            <span>How to create Google Apps Script Webhook (Copy-paste code)</span>
                            <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                          </summary>
                          <div className="mt-2.5 space-y-2 text-slate-600 dark:text-slate-300">
                            <ol className="list-decimal list-inside space-y-1 text-[11px]">
                              <li>Open your Google Sheet, click <strong>Extensions &gt; Apps Script</strong>.</li>
                              <li>Replace the code with the script below and click <strong>Save</strong>.</li>
                              <li>Click <strong>Deploy &gt; New deployment</strong>, select type <strong>Web app</strong>.</li>
                              <li>Set <em>Execute as:</em> <strong>Me</strong>, and <em>Who has access:</em> <strong>Anyone</strong>.</li>
                              <li>Click <strong>Deploy</strong> and copy the <strong>Web app URL</strong> into the field above.</li>
                            </ol>
                            <div className="relative">
                              <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[10px] overflow-x-auto">
{`function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === "test") {
      return ContentService.createTextOutput(JSON.stringify({ valid: true, message: "Connected successfully!" })).setMimeType(ContentService.MimeType.JSON);
    }
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(data.sheet_name || "QA Tickets");
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(data.sheet_name || "QA Tickets");
      sheet.appendRow(["Date", "Issue Type", "Priority", "Title", "Assignee", "Component", "Description", "Expected Result", "Actual Result", "Acceptance Criteria", "Evidence", "Jira Key", "Timestamp"]);
    }
    sheet.appendRow([
      data.date || new Date().toLocaleDateString(),
      data.issue_type || "",
      data.priority || "",
      data.title || "",
      data.assignee || "",
      data.component || "",
      data.description || "",
      data.expected_result || "",
      data.actual_result || data.current_behavior || "",
      data.acceptance_criteria || "",
      data.evidence || "",
      data.jira_key || "",
      data.timestamp || new Date().toISOString()
    ]);
    return ContentService.createTextOutput(JSON.stringify({ success: true, sheet_url: SpreadsheetApp.getActiveSpreadsheet().getUrl() })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, detail: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}`}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-6 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={handleTestSheets}
                          disabled={testingSheets}
                          className="btn-secondary flex items-center gap-1.5 text-xs"
                        >
                          {testingSheets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {testingSheets ? "Testing..." : "Test Connection"}
                        </button>
                        <button type="button" onClick={handleSaveSheets} className="btn-primary flex items-center gap-1.5 text-xs">
                          {savedSheets ? <Check className="h-3.5 w-3.5" /> : null}
                          {savedSheets ? "Saved" : "Save Sheets Settings"}
                        </button>
                        {sheetsConnected && (
                          <button type="button" onClick={handleClearSheets} className="btn-secondary text-xs text-red-600 hover:text-red-700">
                            Disconnect
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
