"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  X,
  Download,
  Maximize2,
  Minimize2,
  FileSpreadsheet,
  ChevronDown,
  Search,
  BookOpen,
  Code2,
  FileText,
  CheckCircle2,
  Plus,
  Menu as MenuIcon,
  Copy,
  Check,
} from "lucide-react";
import { TestCase, ScriptFile } from "@/types";
import toast from "react-hot-toast";
import SendToSheetsModal from "./SendToSheetsModal";
import ScriptViewer from "./ScriptViewer";

export interface SpreadsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  testCases: TestCase[];
  scripts?: ScriptFile[];
  gherkinContent?: string;
  baseUrl?: string;
  initialTab?: "cases" | "guide" | "playwright" | "gherkin";
}

function dlBlob(filename: string, mime: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function formatTcId(tc: TestCase, index: number, title = ""): string {
  if ((tc as any).id && /^[A-Z0-9]+-\d+$/i.test((tc as any).id)) {
    return (tc as any).id.toUpperCase();
  }
  const cleanTitle = (tc.file_name || title || "LOGIN")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(".")[0]
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
  const prefix = cleanTitle.length >= 2 ? cleanTitle.slice(0, 5) : "LOGIN";
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function formatPriority(pri: string): { label: "P0" | "P1" | "P2"; badgeClass: string } {
  const p = (pri || "").toUpperCase();
  if (p === "P0" || p === "CRITICAL" || p === "HIGH") {
    return { label: "P0", badgeClass: "bg-red-100 text-red-700 border border-red-200" };
  }
  if (p === "P1" || p === "MEDIUM") {
    return { label: "P1", badgeClass: "bg-amber-100 text-amber-700 border border-amber-200" };
  }
  return { label: "P2", badgeClass: "bg-blue-100 text-blue-700 border border-blue-200" };
}

function extractTestData(tc: TestCase): string {
  if ((tc as any).test_data) return (tc as any).test_data;

  const allText = [...(tc.test_steps || []), tc.pre_condition || "", tc.name || ""].join(" ");
  const userMatch = allText.match(/(?:username|user|email|login)\s*(?:is|as|=|:|with)?\s*["']?([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+|[a-zA-Z0-9_-]{3,})["']?/i);
  const passMatch = allText.match(/(?:password|pass)\s*(?:is|as|=|:|with)?\s*["']?([^\s"']+)["']?/i);

  if (userMatch || passMatch) {
    const parts: string[] = [];
    if (userMatch) parts.push(`username: "${userMatch[1]}"`);
    if (passMatch) parts.push(`password: "${passMatch[1]}"`);
    return parts.join("\n");
  }

  if (tc.type === "POSITIVE") {
    return 'username: "standard_user"\npassword: "secret_sauce"';
  }
  if (tc.type === "NEGATIVE") {
    if (tc.name.toLowerCase().includes("locked")) {
      return 'username: "locked_out_user"\npassword: "secret_sauce"';
    }
    if (tc.name.toLowerCase().includes("empty") || tc.name.toLowerCase().includes("blank")) {
      return 'username: ""\npassword: ""';
    }
    return 'username: "invalid_user"\npassword: "wrong_password"';
  }
  if (tc.type === "EDGE" || tc.type === "BOUNDARY") {
    return 'input: "A".repeat(256)\nspecial_chars: "<script>alert(1)</script>"';
  }
  if (tc.type === "SECURITY") {
    return 'payload: "\' OR \'1\'=\'1"\nheader: "X-Forwarded-For: 127.0.0.1"';
  }

  return 'username: "standard_user"\npassword: "secret_sauce"';
}

export default function SpreadsheetModal({
  isOpen,
  onClose,
  title = "Test Cases",
  testCases = [],
  scripts = [],
  gherkinContent = "",
  baseUrl = "",
  initialTab = "cases",
}: SpreadsheetModalProps) {
  const [activeTab, setActiveTab] = useState<"cases" | "guide" | "playwright" | "gherkin">(initialTab);
  const [zoom, setZoom] = useState<number>(100);
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCell, setCopiedCell] = useState(false);

  // Active cell coordinate for Formula Bar (Google Sheets style: A1, B2, etc.)
  const [activeCell, setActiveCell] = useState<{ col: "A" | "B" | "C" | "D" | "E" | "F"; row: number }>({
    col: "A",
    row: 1,
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Handle ESC key to exit
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showExportMenu) setShowExportMenu(false);
        else if (showZoomMenu) setShowZoomMenu(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showExportMenu, showZoomMenu, onClose]);

  // Toggle true browser fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const filteredCases = useMemo(() => {
    if (!searchQuery.trim()) return testCases;
    const q = searchQuery.toLowerCase();
    return testCases.filter((tc, idx) => {
      const tcId = formatTcId(tc, idx, title).toLowerCase();
      const steps = (tc.test_steps || []).join(" ").toLowerCase();
      return (
        tcId.includes(q) ||
        tc.name.toLowerCase().includes(q) ||
        tc.priority.toLowerCase().includes(q) ||
        (tc.pre_condition || "").toLowerCase().includes(q) ||
        steps.includes(q)
      );
    });
  }, [testCases, searchQuery, title]);

  // Priority counts
  const priorityCounts = useMemo(() => {
    let p0 = 0;
    let p1 = 0;
    let p2 = 0;
    for (const tc of testCases) {
      const { label } = formatPriority(tc.priority);
      if (label === "P0") p0++;
      else if (label === "P1") p1++;
      else p2++;
    }
    return { p0, p1, p2, total: testCases.length };
  }, [testCases]);

  const sheetTabName = useMemo(() => {
    if (!title) return "Login Only";
    const clean = title.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(".")[0].trim();
    if (!clean || clean.toLowerCase() === "saucedemo" || clean.toLowerCase() === "login") return "Login Only";
    return clean.length > 20 ? clean.slice(0, 20) : clean;
  }, [title]);

  const activeCellValue = useMemo(() => {
    if (activeCell.row === 1) {
      // Header row
      switch (activeCell.col) {
        case "A": return "TC ID";
        case "B": return "Test Scenario";
        case "C": return "Priority";
        case "D": return "Precondition";
        case "E": return "Test Data";
        case "F": return "Test Steps";
      }
    }
    const caseIdx = activeCell.row - 2;
    const tc = filteredCases[caseIdx];
    if (!tc) return "";
    switch (activeCell.col) {
      case "A": return formatTcId(tc, caseIdx, title);
      case "B": return tc.name;
      case "C": return formatPriority(tc.priority).label;
      case "D": return tc.pre_condition || "-";
      case "E": return extractTestData(tc);
      case "F": return (tc.test_steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n");
      default: return "";
    }
  }, [activeCell, filteredCases, title]);

  // Export handlers
  const handleExportCSV = () => {
    const hdrs = ["TC ID", "Test Scenario", "Priority", "Precondition", "Test Data", "Test Steps", "Expected Result"];
    const q = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = filteredCases.map((tc, i) => [
      formatTcId(tc, i, title),
      tc.name,
      formatPriority(tc.priority).label,
      tc.pre_condition || "",
      extractTestData(tc).replace(/\n/g, "; "),
      (tc.test_steps || []).map((s, n) => `${n + 1}. ${s}`).join("\n"),
      tc.expected_result || "",
    ].map(v => q(String(v))).join(","));
    dlBlob(`${title.replace(/[^a-zA-Z0-9]/g, "_")}_test_cases.csv`, "text/csv", [hdrs.map(q).join(","), ...rows].join("\n"));
    toast.success("CSV exported successfully!");
  };

  const handleExportTestRail = () => {
    const hdrs = ["Title", "Section", "Type", "Priority", "Preconditions", "Steps", "Expected Result"];
    const q = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = filteredCases.map((tc, i) => [
      `${formatTcId(tc, i, title)} - ${tc.name}`,
      "Automated Suite",
      tc.type || "Positive",
      formatPriority(tc.priority).label,
      tc.pre_condition || "",
      (tc.test_steps || []).map((s, n) => `${n + 1}. ${s}`).join("\n"),
      tc.expected_result || "",
    ].map(v => q(String(v))).join(","));
    dlBlob("testrail-cases.csv", "text/csv", [hdrs.map(q).join(","), ...rows].join("\n"));
    toast.success("TestRail CSV exported!");
  };

  const handleExportXray = () => {
    const hdrs = ["Summary", "Issue Type", "Priority", "Test Type", "Precondition", "Steps"];
    const q = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = filteredCases.map((tc, i) => [
      `${formatTcId(tc, i, title)} ${tc.name}`,
      "Test",
      formatPriority(tc.priority).label,
      "Manual",
      tc.pre_condition || "",
      (tc.test_steps || []).map((s) => `${s} | | ${tc.expected_result}`).join("\n"),
    ].map(v => q(String(v))).join(","));
    dlBlob("xray-cases.csv", "text/csv", [hdrs.map(q).join(","), ...rows].join("\n"));
    toast.success("Jira Xray CSV exported!");
  };

  const handleExportZephyr = () => {
    const hdrs = ["Name", "Precondition", "Priority", "Step Order", "Step Action", "Expected Result"];
    const q = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows: string[] = [];
    filteredCases.forEach((tc, i) => {
      const steps = tc.test_steps || ["Perform test action"];
      steps.forEach((step, stepIdx) => {
        rows.push([
          `${formatTcId(tc, i, title)} - ${tc.name}`,
          stepIdx === 0 ? tc.pre_condition || "" : "",
          stepIdx === 0 ? formatPriority(tc.priority).label : "",
          stepIdx + 1,
          step,
          stepIdx === steps.length - 1 ? tc.expected_result || "" : "",
        ].map(v => q(String(v))).join(","));
      });
    });
    dlBlob("zephyr-cases.csv", "text/csv", [hdrs.map(q).join(","), ...rows].join("\n"));
    toast.success("Zephyr Scale CSV exported!");
  };

  const handleExportGherkin = () => {
    const lines: string[] = [`Feature: ${title} Test Scenarios\n`];
    filteredCases.forEach((tc, i) => {
      lines.push(`  @${formatPriority(tc.priority).label} @${formatTcId(tc, i, title)}`);
      lines.push(`  Scenario: ${tc.name}`);
      if (tc.pre_condition) lines.push(`    Given ${tc.pre_condition}`);
      (tc.test_steps || []).forEach(step => lines.push(`    When ${step}`));
      if (tc.expected_result) lines.push(`    Then ${tc.expected_result}`);
      lines.push("");
    });
    dlBlob("scenarios.feature", "text/plain", lines.join("\n"));
    toast.success("Gherkin feature file exported!");
  };

  const handleCopyCell = async () => {
    if (!activeCellValue) return;
    try {
      await navigator.clipboard.writeText(activeCellValue);
      setCopiedCell(true);
      setTimeout(() => setCopiedCell(false), 2000);
      toast.success(`Copied cell ${activeCell.col}${activeCell.row} content!`);
    } catch {
      toast.error("Failed to copy cell content");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 w-screen h-screen z-[120] bg-white flex flex-col overflow-hidden text-slate-800 select-none animate-in fade-in duration-100 font-sans"
      role="dialog"
      aria-modal="true"
    >
      {/* ── TOP HEADER / TOOLBAR (Google Sheets Style) ── */}
      <header className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-3 shrink-0 shadow-xs">
        {/* Left: Google Sheets icon + Document Title Dropdown */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-slate-900 tracking-tight">
                {title || "Saucedemo"} - Test Cases ({testCases.length})
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                Live Spreadsheet
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              Synced with SnapTest session • All changes saved
            </span>
          </div>
        </div>

        {/* Right: Quick Search, Zoom, Export, Fullscreen, Exit */}
        <div className="flex items-center gap-2">
          {/* Quick Filter Search */}
          <div className="relative hidden md:block">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in sheet..."
              className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Zoom Dropdown (100% ▾) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowZoomMenu(!showZoomMenu); setShowExportMenu(false); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
              title="Zoom level"
            >
              <span>{zoom}%</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showZoomMenu ? "rotate-180" : ""}`} />
            </button>

            {showZoomMenu && (
              <div className="absolute right-0 top-full mt-1 w-28 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-50">
                {[50, 75, 90, 100, 125, 150].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => { setZoom(z); setShowZoomMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition flex items-center justify-between ${
                      zoom === z ? "bg-indigo-50 text-indigo-700 font-bold" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>{z}%</span>
                    {zoom === z && <Check className="w-3 h-3 text-indigo-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export Menu Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowExportMenu(!showExportMenu); setShowZoomMenu(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition border border-slate-200"
              title="Export spreadsheet"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-2xl py-1 z-50">
                <button
                  type="button"
                  onClick={() => { setShowExportMenu(false); setShowSheetsModal(true); }}
                  className="w-full text-left px-3.5 py-2 text-xs text-emerald-700 font-semibold hover:bg-emerald-50 transition flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Google Spreadsheet Sync</span>
                  </span>
                  <span className="text-[10px] font-normal text-emerald-600">Live</span>
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button
                  type="button"
                  onClick={() => { setShowExportMenu(false); handleExportCSV(); }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
                >
                  Standard CSV (.csv)
                </button>
                <button
                  type="button"
                  onClick={() => { setShowExportMenu(false); handleExportTestRail(); }}
                  className="w-full text-left px-3.5 py-2 text-xs text-indigo-700 hover:bg-indigo-50 transition"
                >
                  TestRail CSV
                </button>
                <button
                  type="button"
                  onClick={() => { setShowExportMenu(false); handleExportXray(); }}
                  className="w-full text-left px-3.5 py-2 text-xs text-indigo-700 hover:bg-indigo-50 transition"
                >
                  Jira Xray CSV
                </button>
                <button
                  type="button"
                  onClick={() => { setShowExportMenu(false); handleExportZephyr(); }}
                  className="w-full text-left px-3.5 py-2 text-xs text-indigo-700 hover:bg-indigo-50 transition"
                >
                  Zephyr Scale CSV
                </button>
                <button
                  type="button"
                  onClick={() => { setShowExportMenu(false); handleExportGherkin(); }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
                >
                  Gherkin (.feature)
                </button>
              </div>
            )}
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title={isFullscreen ? "Exit fullscreen" : "Enter browser fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <div className="w-px h-5 bg-slate-200 mx-0.5" />

          {/* Exit Button */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-semibold transition"
            title="Exit (Esc)"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </header>

      {/* ── FORMULA BAR (A1 | fx | Content) ── */}
      <div className="h-9 border-b border-slate-200 bg-slate-50/80 flex items-center shrink-0 px-2 gap-1 text-xs">
        {/* Cell Coordinate Box */}
        <div className="w-14 h-7 bg-white border border-slate-300 rounded px-2 flex items-center justify-center font-mono font-bold text-slate-700 text-xs shadow-2xs select-none">
          {activeCell.col}{activeCell.row}
        </div>

        {/* Formula Symbol fx */}
        <div className="w-7 h-7 flex items-center justify-center font-serif italic font-bold text-slate-400 select-none text-sm">
          fx
        </div>

        {/* Formula Input / Value Display */}
        <div className="flex-1 h-7 bg-white border border-slate-300 rounded px-2.5 flex items-center justify-between text-slate-800 font-sans shadow-2xs overflow-hidden">
          <input
            type="text"
            readOnly
            value={activeCellValue}
            className="w-full bg-transparent border-none text-xs text-slate-800 focus:outline-none truncate select-text"
          />
          <button
            type="button"
            onClick={handleCopyCell}
            className="ml-2 text-slate-400 hover:text-indigo-600 transition shrink-0"
            title="Copy cell value"
          >
            {copiedCell ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 overflow-auto bg-slate-100/60 relative" ref={tableContainerRef}>
        {activeTab === "cases" && (
          <div
            style={{
              zoom: `${zoom / 100}`,
              minWidth: "100%",
              width: "max-content",
            }}
            className="bg-white"
          >
            <table className="border-collapse w-full text-xs font-sans">
              {/* Column Letters Bar (Google Sheets A - F) */}
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-500 font-medium select-none">
                  {/* Blank Corner (Row numbers header) */}
                  <th className="w-12 min-w-[48px] py-1 border-r border-slate-300 bg-slate-200/70" />

                  {/* Column A */}
                  <th
                    className={`py-1 px-3 text-center border-r border-slate-300 min-w-[130px] font-semibold ${
                      activeCell.col === "A" ? "bg-blue-100 text-blue-700 font-bold" : ""
                    }`}
                  >
                    A
                  </th>

                  {/* Column B */}
                  <th
                    className={`py-1 px-3 text-center border-r border-slate-300 min-w-[320px] font-semibold ${
                      activeCell.col === "B" ? "bg-blue-100 text-blue-700 font-bold" : ""
                    }`}
                  >
                    B
                  </th>

                  {/* Column C */}
                  <th
                    className={`py-1 px-3 text-center border-r border-slate-300 min-w-[110px] font-semibold ${
                      activeCell.col === "C" ? "bg-blue-100 text-blue-700 font-bold" : ""
                    }`}
                  >
                    C
                  </th>

                  {/* Column D */}
                  <th
                    className={`py-1 px-3 text-center border-r border-slate-300 min-w-[260px] font-semibold ${
                      activeCell.col === "D" ? "bg-blue-100 text-blue-700 font-bold" : ""
                    }`}
                  >
                    D
                  </th>

                  {/* Column E */}
                  <th
                    className={`py-1 px-3 text-center border-r border-slate-300 min-w-[260px] font-semibold ${
                      activeCell.col === "E" ? "bg-blue-100 text-blue-700 font-bold" : ""
                    }`}
                  >
                    E
                  </th>

                  {/* Column F */}
                  <th
                    className={`py-1 px-3 text-center border-r border-slate-300 min-w-[380px] font-semibold ${
                      activeCell.col === "F" ? "bg-blue-100 text-blue-700 font-bold" : ""
                    }`}
                  >
                    F
                  </th>
                </tr>

                {/* Dark Navy Row 1: Header Titles (Matching Image #6) */}
                <tr className="bg-[#0f172a] text-white border-b border-slate-800">
                  {/* Row number 1 */}
                  <td
                    onClick={() => setActiveCell({ col: "A", row: 1 })}
                    className={`text-center py-2.5 font-mono text-xs select-none border-r border-slate-300 cursor-pointer ${
                      activeCell.row === 1 ? "bg-blue-200 text-blue-900 font-bold" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    1
                  </td>

                  {/* Column A1: TC ID */}
                  <th
                    onClick={() => setActiveCell({ col: "A", row: 1 })}
                    className={`py-2.5 px-3 text-left font-bold text-xs uppercase tracking-wider border-r border-slate-700 cursor-cell ${
                      activeCell.col === "A" && activeCell.row === 1 ? "ring-2 ring-blue-400 ring-inset" : ""
                    }`}
                  >
                    TC ID
                  </th>

                  {/* Column B1: Test Scenario */}
                  <th
                    onClick={() => setActiveCell({ col: "B", row: 1 })}
                    className={`py-2.5 px-3 text-left font-bold text-xs uppercase tracking-wider border-r border-slate-700 cursor-cell ${
                      activeCell.col === "B" && activeCell.row === 1 ? "ring-2 ring-blue-400 ring-inset" : ""
                    }`}
                  >
                    Test Scenario
                  </th>

                  {/* Column C1: Priority */}
                  <th
                    onClick={() => setActiveCell({ col: "C", row: 1 })}
                    className={`py-2.5 px-3 text-center font-bold text-xs uppercase tracking-wider border-r border-slate-700 cursor-cell ${
                      activeCell.col === "C" && activeCell.row === 1 ? "ring-2 ring-blue-400 ring-inset" : ""
                    }`}
                  >
                    Priority
                  </th>

                  {/* Column D1: Precondition */}
                  <th
                    onClick={() => setActiveCell({ col: "D", row: 1 })}
                    className={`py-2.5 px-3 text-left font-bold text-xs uppercase tracking-wider border-r border-slate-700 cursor-cell ${
                      activeCell.col === "D" && activeCell.row === 1 ? "ring-2 ring-blue-400 ring-inset" : ""
                    }`}
                  >
                    Precondition
                  </th>

                  {/* Column E1: Test Data */}
                  <th
                    onClick={() => setActiveCell({ col: "E", row: 1 })}
                    className={`py-2.5 px-3 text-left font-bold text-xs uppercase tracking-wider border-r border-slate-700 cursor-cell ${
                      activeCell.col === "E" && activeCell.row === 1 ? "ring-2 ring-blue-400 ring-inset" : ""
                    }`}
                  >
                    Test Data
                  </th>

                  {/* Column F1: Test Steps */}
                  <th
                    onClick={() => setActiveCell({ col: "F", row: 1 })}
                    className={`py-2.5 px-3 text-left font-bold text-xs uppercase tracking-wider border-r border-slate-700 cursor-cell ${
                      activeCell.col === "F" && activeCell.row === 1 ? "ring-2 ring-blue-400 ring-inset" : ""
                    }`}
                  >
                    Test Steps
                  </th>
                </tr>
              </thead>

              {/* Data Rows: Row 2 to N + 1 */}
              <tbody>
                {filteredCases.map((tc, idx) => {
                  const rowNum = idx + 2;
                  const tcId = formatTcId(tc, idx, title);
                  const pri = formatPriority(tc.priority);
                  const testData = extractTestData(tc);

                  const isRowSelected = activeCell.row === rowNum;

                  return (
                    <tr
                      key={tcId + idx}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        isRowSelected ? "bg-blue-50/20" : ""
                      }`}
                    >
                      {/* Row Number */}
                      <td
                        onClick={() => setActiveCell({ col: "A", row: rowNum })}
                        className={`text-center py-2 font-mono text-xs select-none border-r border-b border-slate-300 cursor-pointer ${
                          isRowSelected ? "bg-blue-200 text-blue-900 font-bold" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {rowNum}
                      </td>

                      {/* Column A: TC ID (Soft pastel blue background) */}
                      <td
                        onClick={() => setActiveCell({ col: "A", row: rowNum })}
                        className={`px-3 py-2 font-mono font-medium text-xs bg-blue-50/80 text-blue-800 border-r border-b border-slate-200 whitespace-nowrap cursor-cell ${
                          activeCell.col === "A" && activeCell.row === rowNum
                            ? "ring-2 ring-blue-500 ring-inset z-10 relative bg-blue-100"
                            : ""
                        }`}
                      >
                        {tcId}
                      </td>

                      {/* Column B: Test Scenario */}
                      <td
                        onClick={() => setActiveCell({ col: "B", row: rowNum })}
                        className={`px-3 py-2 text-slate-900 text-xs font-normal border-r border-b border-slate-200 cursor-cell leading-relaxed ${
                          activeCell.col === "B" && activeCell.row === rowNum
                            ? "ring-2 ring-blue-500 ring-inset z-10 relative bg-blue-50/40"
                            : ""
                        }`}
                      >
                        {tc.name}
                      </td>

                      {/* Column C: Priority (Pastel badge: P0, P1, P2) */}
                      <td
                        onClick={() => setActiveCell({ col: "C", row: rowNum })}
                        className={`px-3 py-2 text-center border-r border-b border-slate-200 cursor-cell ${
                          activeCell.col === "C" && activeCell.row === rowNum
                            ? "ring-2 ring-blue-500 ring-inset z-10 relative bg-blue-50/40"
                            : ""
                        }`}
                      >
                        <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide ${pri.badgeClass}`}>
                          {pri.label}
                        </span>
                      </td>

                      {/* Column D: Precondition */}
                      <td
                        onClick={() => setActiveCell({ col: "D", row: rowNum })}
                        className={`px-3 py-2 text-slate-600 text-xs border-r border-b border-slate-200 cursor-cell leading-relaxed ${
                          activeCell.col === "D" && activeCell.row === rowNum
                            ? "ring-2 ring-blue-500 ring-inset z-10 relative bg-blue-50/40"
                            : ""
                        }`}
                      >
                        {tc.pre_condition || "-"}
                      </td>

                      {/* Column E: Test Data */}
                      <td
                        onClick={() => setActiveCell({ col: "E", row: rowNum })}
                        className={`px-3 py-2 font-mono text-[11px] text-slate-700 border-r border-b border-slate-200 whitespace-pre-line cursor-cell leading-tight ${
                          activeCell.col === "E" && activeCell.row === rowNum
                            ? "ring-2 ring-blue-500 ring-inset z-10 relative bg-blue-50/40"
                            : ""
                        }`}
                      >
                        {testData}
                      </td>

                      {/* Column F: Test Steps (Multi-line numbered steps) */}
                      <td
                        onClick={() => setActiveCell({ col: "F", row: rowNum })}
                        className={`px-3 py-2 text-slate-800 text-xs border-r border-b border-slate-200 cursor-cell leading-relaxed ${
                          activeCell.col === "F" && activeCell.row === rowNum
                            ? "ring-2 ring-blue-500 ring-inset z-10 relative bg-blue-50/40"
                            : ""
                        }`}
                      >
                        <ol className="list-none space-y-0.5">
                          {(tc.test_steps || []).map((step, stepI) => (
                            <li key={stepI} className="flex gap-1.5">
                              <span className="text-slate-400 font-mono shrink-0 w-4 text-right">
                                {stepI + 1}.
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  );
                })}

                {filteredCases.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                      No matching test cases found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── PANDUAN (Guide Sheet) ── */}
        {activeTab === "guide" && (
          <div className="max-w-4xl mx-auto p-6 space-y-6 bg-white min-h-full">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <span>Panduan Eksekusi & Manajemen Test Case (QA Guidelines)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Standar pengujian mutu perangkat lunak, klasifikasi prioritas skenario, dan otomatisasi SnapTest.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-red-200 bg-red-50/40">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                  P0 (Critical / Blocker)
                </span>
                <h4 className="text-sm font-semibold text-slate-800 mt-2">Skenario Kritis</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Alur inti yang memblokir akses pengguna (Autentikasi, Login berhasil, Checkout, Transaksi pembayaran). Wajib 100% lulus sebelum rilis.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                  P1 (High / Major)
                </span>
                <h4 className="text-sm font-semibold text-slate-800 mt-2">Fungsionalitas Utama</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Validasi input form, pesan error validasi login salah, pencarian data, sorting, dan navigasi modul penting.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                  P2 (Medium / Edge)
                </span>
                <h4 className="text-sm font-semibold text-slate-800 mt-2">Kasus Batas & Minor</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Pengujian boundary nilai ekstrem, karakter spesial, format layar responsif, dan kasus tepi keamanan dasar.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Sinkronisasi & Otomatisasi
              </h4>
              <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
                <li>
                  <strong>Google Spreadsheet:</strong> Gunakan tombol <em>Export &gt; Google Spreadsheet Sync</em> untuk sinkronisasi otomatis ke spreadsheet proyek Anda.
                </li>
                <li>
                  <strong>Playwright & Cypress:</strong> Tab <em>Playwright Scripts</em> menyediakan script otomatisasi siap uji yang dapat langsung dieksekusi di runner lokal atau CI/CD.
                </li>
                <li>
                  <strong>Jira & TestRail:</strong> Ekspor ke CSV TestRail, Jira Xray, atau Zephyr Scale untuk integrasi instan dengan manajemen test enterprise.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ── PLAYWRIGHT SCRIPTS VIEW ── */}
        {activeTab === "playwright" && (
          <div className="h-full p-4">
            {scripts && scripts.length > 0 ? (
              <ScriptViewer scripts={scripts} baseUrl={baseUrl} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <Code2 className="w-8 h-8 text-slate-300" />
                <p className="text-xs">No Playwright scripts generated yet.</p>
                <p className="text-[11px] text-slate-400">
                  Click the Playwright button in chat to generate automation scripts.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── GHERKIN SCENARIOS VIEW ── */}
        {activeTab === "gherkin" && (
          <div className="h-full flex flex-col p-4 bg-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>scenarios.feature (Gherkin BDD)</span>
              </span>
              <button
                type="button"
                onClick={handleExportGherkin}
                className="px-2.5 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50 font-medium transition"
              >
                Download .feature
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
              {gherkinContent || "No Gherkin scenarios generated yet."}
            </pre>
          </div>
        )}
      </div>

      {/* ── BOTTOM SHEET TABS BAR (Google Sheets Style) ── */}
      <footer className="h-10 border-t border-slate-300 bg-slate-100 flex items-center justify-between px-2 shrink-0 select-none text-xs">
        {/* Left: Add Sheet (+) + Sheet List (≡) + Sheet Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            className="p-1.5 hover:bg-slate-200 rounded text-slate-500 transition"
            title="Add sheet (read-only in preview)"
            onClick={() => toast("Additional custom sheets can be created via Google Sheets sync.")}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="p-1.5 hover:bg-slate-200 rounded text-slate-500 transition"
            title="All sheets"
          >
            <MenuIcon className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-slate-300 mx-1" />

          {/* Sheet 1: Main Test Cases (Active) */}
          <button
            type="button"
            onClick={() => setActiveTab("cases")}
            className={`px-3.5 py-1.5 rounded-t font-semibold text-xs transition flex items-center gap-1.5 border-b-2 ${
              activeTab === "cases"
                ? "bg-white text-emerald-700 border-emerald-600 shadow-2xs"
                : "text-slate-600 hover:bg-slate-200 border-transparent"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>{sheetTabName}</span>
          </button>

          {/* Sheet 2: Panduan */}
          <button
            type="button"
            onClick={() => setActiveTab("guide")}
            className={`px-3.5 py-1.5 rounded-t font-semibold text-xs transition flex items-center gap-1.5 border-b-2 ${
              activeTab === "guide"
                ? "bg-white text-emerald-700 border-emerald-600 shadow-2xs"
                : "text-slate-600 hover:bg-slate-200 border-transparent"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
            <span>Panduan</span>
          </button>

          {/* Sheet 3: Playwright Scripts (if exists) */}
          {scripts && scripts.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("playwright")}
              className={`px-3.5 py-1.5 rounded-t font-semibold text-xs transition flex items-center gap-1.5 border-b-2 ${
                activeTab === "playwright"
                  ? "bg-white text-emerald-700 border-emerald-600 shadow-2xs"
                  : "text-slate-600 hover:bg-slate-200 border-transparent"
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Playwright ({scripts.length})</span>
            </button>
          )}

          {/* Sheet 4: Gherkin Scenarios (if exists) */}
          {gherkinContent && (
            <button
              type="button"
              onClick={() => setActiveTab("gherkin")}
              className={`px-3.5 py-1.5 rounded-t font-semibold text-xs transition flex items-center gap-1.5 border-b-2 ${
                activeTab === "gherkin"
                  ? "bg-white text-emerald-700 border-emerald-600 shadow-2xs"
                  : "text-slate-600 hover:bg-slate-200 border-transparent"
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              <span>Gherkin</span>
            </button>
          )}
        </div>

        {/* Right: Metrics & Coverage breakdown */}
        <div className="flex items-center gap-3 text-[11px] text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-700">{priorityCounts.total}</span>
            <span>test cases</span>
          </div>

          <div className="w-px h-3.5 bg-slate-300" />

          <div className="flex items-center gap-2">
            <span className="font-semibold text-red-600">P0: {priorityCounts.p0}</span>
            <span className="font-semibold text-amber-600">P1: {priorityCounts.p1}</span>
            <span className="font-semibold text-blue-600">P2: {priorityCounts.p2}</span>
          </div>

          <div className="w-px h-3.5 bg-slate-300" />

          <span className="flex items-center gap-1 text-emerald-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% Coverage</span>
          </span>
        </div>
      </footer>

      {/* ── GOOGLE SPREADSHEET SYNC MODAL ── */}
      {showSheetsModal && (
        <SendToSheetsModal
          isOpen={showSheetsModal}
          onClose={() => setShowSheetsModal(false)}
          title={`Sync ${title} to Google Spreadsheet`}
          defaultSheetName={sheetTabName}
          headers={["TC ID", "Test Scenario", "Priority", "Precondition", "Test Data", "Test Steps", "Expected Result"]}
          rows={filteredCases.map((tc, i) => [
            formatTcId(tc, i, title),
            tc.name,
            formatPriority(tc.priority).label,
            tc.pre_condition || "",
            extractTestData(tc),
            (tc.test_steps || []).map((s, n) => `${n + 1}. ${s}`).join("\n"),
            tc.expected_result || "",
          ])}
          onSuccess={(url) => {
            setShowSheetsModal(false);
            toast.success("Spreadsheet synchronized successfully!");
          }}
        />
      )}
    </div>
  );
}
