"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Zap,
  Settings,
  Ticket,
  ChevronLeft,
  ChevronRight,
  Layers,
  Menu,
  X,
  LayoutDashboard,
  Database,
  Globe2,
  BookOpen,
  PieChart,
} from "lucide-react";

export type PageId = "dashboard" | "generate" | "ticket" | "settings" | "data" | "api-agent" | "planner" | "report";

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

const NAV_ITEMS: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: "generate", label: "Test Case Agent", icon: <Zap className="w-5 h-5" /> },
  { id: "planner", label: "Test Planner", icon: <BookOpen className="w-5 h-5" /> },
  { id: "ticket", label: "Issue & Ticket Agent", icon: <Ticket className="w-5 h-5" /> },
  { id: "api-agent", label: "API Test Agent", icon: <Globe2 className="w-5 h-5" /> },
  { id: "data", label: "Test Data Generator", icon: <Database className="w-5 h-5" /> },
  { id: "report", label: "Executive Report", icon: <PieChart className="w-5 h-5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="w-5 h-5" /> },
];

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavigate = (page: PageId) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  // ponytail: prefetch on hover so menu clicks feel instant in prod (App Router caches the RSC payload).
  const handlePrefetch = (page: PageId) => {
    if (page !== activePage) router.prefetch(`/${page}`);
  };

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
          </button>
          <Link href="/" className="flex items-center gap-2" aria-label="Back to landing page">
            <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900">SnapTest</span>
          </Link>
        </div>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="lg:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`lg:hidden fixed top-0 left-0 z-50 h-full w-[260px] bg-white border-r border-slate-200 transform transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 px-4 py-5 border-b border-slate-100" aria-label="Back to landing page">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-tight">SnapTest</h1>
            <p className="text-[11px] text-slate-400">Code Less. Test More</p>
          </div>
        </Link>

        <nav className="px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className={`flex-shrink-0 ${isActive ? "text-indigo-600" : "text-slate-400"}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex h-screen sticky top-0 flex-col bg-white border-r border-slate-200 transition-all duration-300 ${
          collapsed ? "w-[68px]" : "w-[240px]"
        }`}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 px-4 py-5 border-b border-slate-100" aria-label="Back to landing page">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-base font-semibold text-slate-900 leading-tight">SnapTest</h1>
              <p className="text-[11px] text-slate-400">Code Less. Test More</p>
            </div>
          )}
        </Link>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                onMouseEnter={() => handlePrefetch(item.id)}
                onFocus={() => handlePrefetch(item.id)}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className={`flex-shrink-0 ${isActive ? "text-indigo-600" : "text-slate-400"}`}>
                  {item.icon}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="px-3 py-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
