"use client";
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { ModelsResponse } from "@/types";
import { getApiKey } from "@/lib/keys";
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

  const refreshModels = useCallback(async () => {
    try {
      const res = await axios.get<ModelsResponse>("/api/models");
      setModelsData(res.data);
      const saved = localStorage.getItem("snaptest_selected_provider_model");
      if (saved) {
        try {
          const { provider, model } = JSON.parse(saved);
          const validSelection = typeof provider === "string" && typeof model === "string" && res.data.providers[provider]?.includes(model);
          const isConnected = provider === "9router-public" || (provider === "9router" ? res.data.status[provider] === "connected" : !!getApiKey(provider));
          if (validSelection && isConnected) { setAiProvider(provider); setAiModel(model); return; }
        } catch {
          localStorage.removeItem("snaptest_selected_provider_model");
        }
      }
      setAiProvider(""); setAiModel("");
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
