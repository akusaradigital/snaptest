"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Zap,
  Settings,
  Ticket,
  Layers,
  Menu,
  X,
  LayoutDashboard,
  Globe2,
  Camera,
  Kanban,
  ExternalLink,
} from "lucide-react";

export type PageId = "dashboard" | "generate" | "ticket" | "settings" | "data" | "api-agent" | "planner" | "report";

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

const NAV_ITEMS: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: "generate", label: "Test Agent", icon: <Zap className="w-5 h-5" /> },
  { id: "api-agent", label: "API Agent", icon: <Globe2 className="w-5 h-5" /> },
  { id: "ticket", label: "Issue Agent", icon: <Ticket className="w-5 h-5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="w-5 h-5" /> },
];

function SidebarToggleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="4" />
      <path d="M9 3v18" />
    </svg>
  );
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl+Shift+S");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("snaptest_sidebar_collapsed");
      if (saved !== null) {
        setCollapsed(saved === "true");
      }
    } catch {}
    if (typeof window !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || "")) {
      setShortcutLabel("⌘+Shift+S");
    }
  }, []);

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("snaptest_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        handleToggleCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isItemActive = (itemId: PageId) => {
    if (itemId === activePage) return true;
    if (itemId === "generate" && (activePage === "planner" || activePage === "data")) return true;
    if (itemId === "dashboard" && activePage === "report") return true;
    return false;
  };

  const handleNavigate = (page: PageId) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  // prefetch on hover so menu clicks feel instant in prod
  const handlePrefetch = (page: PageId) => {
    if (page !== activePage) router.prefetch(`/${page}`);
  };

  useEffect(() => {
    const prefetchAll = () => NAV_ITEMS.forEach((item) => handlePrefetch(item.id));
    if ("requestIdleCallback" in window) {
      const idle = window.requestIdleCallback(prefetchAll, { timeout: 1500 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(prefetchAll, 500);
    return () => clearTimeout(timer);
  }, [activePage]);

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5 text-slate-600 dark:text-slate-300" /> : <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />}
          </button>
          <Link href="/" className="flex items-center gap-2" aria-label="Back to landing page">
            <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">SnapTest</span>
          </Link>
        </div>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`lg:hidden fixed top-0 left-0 z-50 h-full w-[260px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 px-4 py-5 border-b border-slate-100 dark:border-slate-800" aria-label="Back to landing page">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight">SnapTest</h1>
            <p className="text-[11px] text-slate-400">Code Less. Test More</p>
          </div>
        </Link>

        <nav className="px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = isItemActive(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <span className={`flex-shrink-0 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Sister Apps Drawer Block */}
          <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Sister Apps
            </p>
            <a
              href={process.env.NEXT_PUBLIC_BUGSNAP_URL || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200 transition"
            >
              <span className="flex items-center gap-2.5">
                <Camera className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span>BugSnap (Capture)</span>
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <a
              href={process.env.NEXT_PUBLIC_AKSORA_URL || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200 transition"
            >
              <span className="flex items-center gap-2.5">
                <Kanban className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>Aksora (Projects)</span>
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>
        </nav>
      </aside>

      {/* Desktop Sidebar (Collapsible Rail with ChatGPT-style Tooltip) */}
      <aside
        className={`hidden lg:flex h-screen sticky top-0 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 z-30 ${
          collapsed ? "w-[64px]" : "w-[240px]"
        }`}
      >
        {/* Header / Brand & Toggle (Matching Image #11) */}
        <div className={`border-b border-slate-100 dark:border-slate-800 transition-all ${collapsed ? "py-3 px-2 flex justify-center" : "px-4 py-4 flex items-center justify-between"}`}>
          {!collapsed ? (
            <>
              <Link href="/" className="flex items-center gap-2.5 min-w-0" aria-label="Back to landing page">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0 shadow-xs">
                  <Layers className="w-4 h-4 text-white" />
                </div>
                <div className="overflow-hidden">
                  <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">SnapTest</h1>
                  <p className="text-[10px] text-slate-400 truncate">Code Less. Test More</p>
                </div>
              </Link>
              <div className="relative group">
                <button
                  type="button"
                  onClick={handleToggleCollapse}
                  className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-label="Collapse sidebar"
                >
                  <SidebarToggleIcon className="w-4 h-4" />
                </button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 z-50 hidden group-hover:flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-950 dark:bg-black text-white shadow-2xl border border-neutral-800/80 whitespace-nowrap">
                  <span className="text-xs font-semibold text-white">Toggle sidebar</span>
                  <kbd className="text-[10px] font-semibold bg-neutral-800 text-neutral-200 px-1.5 py-0.5 rounded-full border border-neutral-700/60 font-mono">
                    {shortcutLabel}
                  </kbd>
                </div>
              </div>
            </>
          ) : (
            <div className="relative group">
              <button
                type="button"
                onClick={handleToggleCollapse}
                className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Expand sidebar"
              >
                <SidebarToggleIcon className="w-5 h-5" />
              </button>
              {/* ChatGPT-style Tooltip with Ctrl+Shift+S (Image #11) */}
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 hidden group-hover:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-neutral-950 dark:bg-black text-white shadow-2xl border border-neutral-800/90 whitespace-nowrap">
                <span className="text-xs font-semibold text-white tracking-normal">Toggle sidebar</span>
                <kbd className="text-[11px] font-semibold bg-neutral-800 text-neutral-200 px-2 py-0.5 rounded-full border border-neutral-700/60 font-mono">
                  {shortcutLabel}
                </kbd>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Rail */}
        <nav className={`flex-1 px-2.5 py-3 space-y-1.5 ${collapsed ? "overflow-visible" : "overflow-y-auto"}`}>
          {NAV_ITEMS.map((item) => {
            const isActive = isItemActive(item.id);
            return (
              <div key={item.id} className="relative group">
                <button
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  onMouseEnter={() => handlePrefetch(item.id)}
                  onFocus={() => handlePrefetch(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-full flex items-center ${collapsed ? "justify-center w-10 h-10 mx-auto rounded-xl" : "gap-3 px-3 py-2.5 rounded-lg text-sm"} font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isActive
                      ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <span className={`flex-shrink-0 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-400"}`}>
                    {item.icon}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
                {collapsed && (
                  <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 hidden group-hover:flex items-center px-3 py-1.5 rounded-xl bg-neutral-950 dark:bg-black text-white shadow-xl text-xs font-semibold whitespace-nowrap border border-neutral-800/80">
                    {item.label}
                  </div>
                )}
              </div>
            );
          })}

          {/* Sister Apps Desktop Block */}
          <div className={`pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 ${collapsed ? "overflow-visible" : ""}`}>
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Sister Apps
              </p>
            )}
            <div className="relative group">
              <a
                href={process.env.NEXT_PUBLIC_BUGSNAP_URL || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full flex items-center ${collapsed ? "justify-center w-10 h-10 mx-auto rounded-xl" : "justify-between px-3 py-2 rounded-lg text-xs"} font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200 transition`}
              >
                <span className="flex items-center gap-2.5">
                  <Camera className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  {!collapsed && <span className="truncate">BugSnap</span>}
                </span>
                {!collapsed && <ExternalLink className="w-3 h-3 text-slate-400" />}
              </a>
              {collapsed && (
                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 hidden group-hover:flex items-center px-3 py-1.5 rounded-xl bg-neutral-950 dark:bg-black text-white shadow-xl text-xs font-semibold whitespace-nowrap border border-neutral-800/80">
                  BugSnap (Capture)
                </div>
              )}
            </div>

            <div className="relative group">
              <a
                href={process.env.NEXT_PUBLIC_AKSORA_URL || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full flex items-center ${collapsed ? "justify-center w-10 h-10 mx-auto rounded-xl" : "justify-between px-3 py-2 rounded-lg text-xs"} font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200 transition`}
              >
                <span className="flex items-center gap-2.5">
                  <Kanban className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  {!collapsed && <span className="truncate">Aksora</span>}
                </span>
                {!collapsed && <ExternalLink className="w-3 h-3 text-slate-400" />}
              </a>
              {collapsed && (
                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 hidden group-hover:flex items-center px-3 py-1.5 rounded-xl bg-neutral-950 dark:bg-black text-white shadow-xl text-xs font-semibold whitespace-nowrap border border-neutral-800/80">
                  Aksora (Projects)
                </div>
              )}
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}
