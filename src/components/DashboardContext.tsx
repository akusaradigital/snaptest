"use client";
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { ModelsResponse } from "@/types";
import { get9RouterPublicConfig, getApiKey } from "@/lib/keys";
import axios from "axios";

interface DashboardCtx {
  aiProvider: string; aiModel: string; modelsData: ModelsResponse | null;
  prefillUrl: string; prefillContext: string;
  handleProviderChange: (p: string, m: string) => void;
  setPrefill: (url: string, ctx: string) => void;
  consumePrefill: () => void;
  refreshModels: () => Promise<void>;
}

const Ctx = createContext<DashboardCtx>({} as DashboardCtx);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [modelsData, setModelsData] = useState<ModelsResponse | null>(null);
  const [aiProvider, setAiProvider] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [prefillUrl, setPrefillUrl] = useState("");
  const [prefillContext, setPrefillContext] = useState("");

  const applySavedSelection = (data: ModelsResponse) => {
    const saved = localStorage.getItem("snaptest_selected_provider_model");
    if (!saved) return false;
    try {
      const { provider, model } = JSON.parse(saved);
      const publicCfg = provider === "9router-public" ? get9RouterPublicConfig() : null;
      const providerModels = provider === "9router-public" ? publicCfg?.models : data.providers[provider];
      const validSelection = typeof provider === "string" && typeof model === "string" && providerModels?.includes(model);
      const isConnected = provider === "9router-public"
        ? !!publicCfg?.url && !!providerModels?.length
        : provider === "9router" ? data.status[provider] === "connected" : !!getApiKey(provider);
      if (!validSelection || !isConnected) return false;
      setAiProvider(provider);
      setAiModel(model);
      return true;
    } catch {
      localStorage.removeItem("snaptest_selected_provider_model");
      return false;
    }
  };

  const refreshModels = useCallback(async () => {
    try {
      const cached = sessionStorage.getItem("snaptest_models_cache");
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          setModelsData(cachedData);
          applySavedSelection(cachedData);
        } catch { sessionStorage.removeItem("snaptest_models_cache"); }
      }
      const start = performance.now();
      const res = await axios.get<ModelsResponse>("/api/models");
      if (process.env.NODE_ENV === "development") console.info(`[perf] /api/models ${Math.round(performance.now() - start)}ms`);
      setModelsData(res.data);
      sessionStorage.setItem("snaptest_models_cache", JSON.stringify(res.data));
      if (!applySavedSelection(res.data)) { setAiProvider(""); setAiModel(""); }
    } catch {}
  }, []);

  useEffect(() => { refreshModels(); }, [refreshModels]);

  const handleProviderChange = (provider: string, model: string) => {
    setAiProvider(provider); setAiModel(model);
    if (provider && model) localStorage.setItem("snaptest_selected_provider_model", JSON.stringify({ provider, model }));
    else localStorage.removeItem("snaptest_selected_provider_model");
  };

  const setPrefill = (url: string, ctx: string) => { setPrefillUrl(url); setPrefillContext(ctx); };
  const consumePrefill = () => { setPrefillUrl(""); setPrefillContext(""); };

  return (
    <Ctx.Provider value={{ aiProvider, aiModel, modelsData, prefillUrl, prefillContext, handleProviderChange, setPrefill, consumePrefill, refreshModels }}>
      {children}
    </Ctx.Provider>
  );
}

export const useDashboard = () => useContext(Ctx);
