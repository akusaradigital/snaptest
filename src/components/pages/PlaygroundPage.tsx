"use client";

import { useState } from "react";
import axios from "axios";
import {
  MousePointerClick,
  Play,
  Globe,
  Code2,
  CheckCircle2,
  XCircle,
  Loader2,
  Wand2,
  Copy,
} from "lucide-react";
import toast from "react-hot-toast";

const API_URL = "";

interface SelectorResult {
  selector: string;
  matchCount: number;
  elements: { tag: string; text: string; id?: string }[];
  isUnique: boolean;
}

interface PageElement {
  tag: string;
  id: string | null;
  name: string | null;
  type: string | null;
  placeholder: string | null;
  aria_label: string | null;
  css_selector: string;
  text_content: string | null;
}

function ensureProtocol(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function PlaygroundPage() {
  const [url, setUrl] = useState("");
  const [selector, setSelector] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<SelectorResult | null>(null);
  const [error, setError] = useState("");
  const [pageLoaded, setPageLoaded] = useState(false);
  const [pageTitle, setPageTitle] = useState("");
  const [elementsCount, setElementsCount] = useState(0);
  const [pageElements, setPageElements] = useState<PageElement[]>([]);
  const [showElements, setShowElements] = useState(false);

  const handleLoadPage = async () => {
    const finalUrl = ensureProtocol(url);
    if (!finalUrl) return;
    setUrl(finalUrl);
    setIsLoading(true);
    setError("");
    setResult(null);
    setPageLoaded(false);

    try {
      const res = await axios.post(`${API_URL}/api/playground/load`, {
        url: finalUrl,
      });
      setPageLoaded(true);
      setPageTitle(res.data.title || "Page loaded");
      setElementsCount(res.data.elements_count || 0);
      // Store elements for the selector builder
      if (res.data.elements) {
        setPageElements(res.data.elements);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load page. Check the URL and try again.");
      setPageLoaded(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestSelector = async () => {
    if (!selector.trim() || !pageLoaded) return;
    setIsTesting(true);
    setError("");
    setResult(null);

    try {
      const res = await axios.post(`${API_URL}/api/playground/test`, {
        url: ensureProtocol(url),
        selector: selector.trim(),
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to test selector");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 lg:mb-8">
        <h2 className="text-xl lg:text-2xl font-semibold text-slate-900 mb-2">
          Selector Playground
        </h2>
        <p className="text-sm lg:text-base text-slate-500 max-w-xl">
          Test CSS selectors against a live page. Check if your selectors are unique
          and see which elements they match.
        </p>
      </div>

      {/* URL Input */}
      <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
        <label htmlFor="playground-url" className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
          <Globe className="w-4 h-4 text-slate-400" />
          Target URL
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="playground-url"
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setPageLoaded(false);
              setResult(null);
            }}
            placeholder="https://example.com/login"
            className="input-field flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLoadPage();
              }
            }}
          />
          <button
            type="button"
            onClick={handleLoadPage}
            disabled={isLoading || !url.trim()}
            className="btn-primary flex items-center justify-center gap-2 sm:w-auto"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isLoading ? "Loading..." : "Load Page"}
          </button>
        </div>
        {pageLoaded && (
          <div className={`mt-3 p-3 border rounded-lg ${elementsCount === 0 ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"}`}>
            <p className={`text-sm font-medium flex items-center gap-2 ${elementsCount === 0 ? "text-amber-700" : "text-emerald-700"}`}>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {pageTitle}
            </p>
            <p className={`text-xs mt-1 ml-6 ${elementsCount === 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {elementsCount} interactive elements detected
              {elementsCount === 0 && " - site may block bots or require login. Try a specific sub-page (e.g. /login, /checkout)."}
            </p>
          </div>
        )}
      </div>

      {/* Selector Input */}
      {pageLoaded && (
        <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
          <label htmlFor="selector-input" className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <Code2 className="w-4 h-4 text-slate-400" />
            CSS Selector
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="selector-input"
              type="text"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="#login-button, input[name='email'], .submit-btn"
              className="input-field flex-1 font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTestSelector();
                }
              }}
            />
            <button
              type="button"
              onClick={handleTestSelector}
              disabled={isTesting || !selector.trim()}
              className="btn-primary flex items-center justify-center gap-2 sm:w-auto"
            >
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MousePointerClick className="w-4 h-4" />}
              {isTesting ? "Testing..." : "Test Selector"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Try selectors like <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">#user-name</code> or <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">input[type=&quot;password&quot;]</code>
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg mb-4 sm:mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800">
              Results for <code className="bg-slate-100 px-2 py-0.5 rounded font-mono text-indigo-600">{result.selector}</code>
            </h3>
            <div className="flex items-center gap-2">
              {result.isUnique ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Unique
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                  <XCircle className="w-3 h-3" />
                  {result.matchCount} matches
                </span>
              )}
            </div>
          </div>

          {result.matchCount === 0 ? (
            <div className="p-4 bg-slate-50 rounded-lg text-center">
              <p className="text-sm text-slate-500">No elements matched this selector.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {result.elements.map((el, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 bg-slate-50 rounded-lg text-sm"
                >
                  <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    &lt;{el.tag}&gt;
                  </span>
                  {el.id && (
                    <span className="font-mono text-xs text-slate-500">#{el.id}</span>
                  )}
                  {el.text && (
                    <span className="text-slate-600 truncate text-xs sm:text-sm">{el.text}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state when page not loaded */}
      {!pageLoaded && !isLoading && !error && (
        <div className="card p-8 sm:p-12 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MousePointerClick className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400" />
          </div>
          <h3 className="text-base sm:text-lg font-medium text-slate-700 mb-2">Load a page to start</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Enter a URL above and click Load. Then you can test any CSS selector against the page&apos;s DOM.
          </p>
        </div>
      )}

      {/* Element Browser / Selector Suggestions */}
      {pageLoaded && pageElements.length > 0 && (
        <div className="card overflow-hidden mt-4 sm:mt-6">
          <button
            type="button"
            onClick={() => setShowElements(!showElements)}
            className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-medium text-slate-700">
                Element Browser ({pageElements.length} elements)
              </span>
            </div>
            <span className="text-xs text-slate-400">
              {showElements ? "Hide" : "Click to browse & pick selectors"}
            </span>
          </button>

          {showElements && (
            <div className="border-t border-slate-100 max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Element</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Selector</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Info</th>
                    <th className="px-4 py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageElements.map((el, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2">
                        <span className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                          &lt;{el.tag}&gt;
                        </span>
                        {el.type && (
                          <span className="ml-1 text-slate-400">[{el.type}]</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <code className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                          {el.css_selector}
                        </code>
                      </td>
                      <td className="px-4 py-2 text-slate-500 truncate max-w-[150px]">
                        {el.placeholder || el.aria_label || el.text_content || el.name || "-"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelector(el.css_selector);
                              toast.success("Selector copied to input");
                            }}
                            className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition"
                            title="Use this selector"
                          >
                            <MousePointerClick className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(el.css_selector);
                              toast.success("Copied!");
                            }}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                            title="Copy selector"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
