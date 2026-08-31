"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { ModelsResponse } from "@/types";
import { getApiKey, getAllKeys, get9RouterPublicConfig, setApiKey, removeApiKey } from "@/lib/keys";
import toast from "react-hot-toast";
import { Settings, X, RefreshCw, ChevronDown, ExternalLink, Key, Check } from "lucide-react";

const API_URL = "";

interface AISettingsProps {
  onProviderChange: (provider: string, model: string) => void;
  selectedProvider: string;
  selectedModel: string;
  modelsData: ModelsResponse | null;
  refreshModels: () => Promise<void>;
  inline?: boolean;
}

type ConnectionStatus = "connected" | "has_key" | "disconnected";

interface ProviderState {
  status: ConnectionStatus;
  keyInput: string;
  urlInput?: string;
  showInput: boolean;
  validating: boolean;
}

const PROVIDER_INFO: Record<string, { label: string; color: string; placeholder: string; docUrl: string }> = {
  openai: {
    label: "OpenAI",
    color: "bg-emerald-500",
    placeholder: "sk-proj-...",
    docUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Claude",
    color: "bg-violet-500",
    placeholder: "sk-ant-...",
    docUrl: "https://console.anthropic.com/settings/keys",
  },
  google: {
    label: "Gemini",
    color: "bg-blue-500",
    placeholder: "AIza...",
    docUrl: "https://aistudio.google.com/app/apikey",
  },
  groq: {
    label: "Groq",
    color: "bg-orange-500",
    placeholder: "gsk_...",
    docUrl: "https://console.groq.com/keys",
  },
  deepseek: {
    label: "DeepSeek",
    color: "bg-cyan-500",
    placeholder: "sk-...",
    docUrl: "https://platform.deepseek.com/api_keys",
  },
  moonshot: {
    label: "Moonshot (Kimi)",
    color: "bg-purple-500",
    placeholder: "sk-...",
    docUrl: "https://platform.moonshot.cn/console/api-keys",
  },
  alibaba: {
    label: "Alibaba (Qwen)",
    color: "bg-amber-500",
    placeholder: "sk-...",
    docUrl: "https://dashscope.console.aliyun.com/apiKey",
  },
  '9router': {
    label: "9Router (Local)",
    color: "bg-indigo-600",
    placeholder: "sk-... (API key optional if Require API key is off)",
    docUrl: "http://localhost:20128",
  },
  '9router-public': {
    label: "9Router (Public)",
    color: "bg-violet-500",
    placeholder: "https://your-domain.com/v1 sk-9router-...",
    docUrl: "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/",
  },
};

const EMPTY_9ROUTER_PUBLIC = { url: "", key: "", models: [], selectedModel: "" };

const maskText = (text: string, isUrl = false) => {
  if (!text) return isUrl ? "No URL" : "No key required";
  if (isUrl) {
    try {
      const url = new URL(text);
      const host = url.hostname;
      return `${url.protocol}//${host[0]}...${host[host.length - 1]}${url.pathname}`;
    } catch {
      return text.length > 10 ? `${text.slice(0, 5)}...${text.slice(-5)}` : text;
    }
  }
  return text.length > 8 ? `${text.slice(0, 6)}...${text.slice(-4)}` : "••••••••";
};

export default function AISettings({
  onProviderChange,
  selectedProvider,
  selectedModel,
  modelsData,
  refreshModels,
  inline = false,
}: AISettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLocal, setIsLocal] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsLocal(window.location.hostname === "localhost");
  }, []);

  const [providers, setProviders] = useState<Record<string, ProviderState>>({
    openai: { status: "disconnected", keyInput: "", showInput: false, validating: false },
    anthropic: { status: "disconnected", keyInput: "", showInput: false, validating: false },
    google: { status: "disconnected", keyInput: "", showInput: false, validating: false },
    groq: { status: "disconnected", keyInput: "", showInput: false, validating: false },
    deepseek: { status: "disconnected", keyInput: "", showInput: false, validating: false },
    moonshot: { status: "disconnected", keyInput: "", showInput: false, validating: false },
    alibaba: { status: "disconnected", keyInput: "", showInput: false, validating: false },
    '9router': { status: "disconnected", keyInput: "", showInput: false, validating: false },
    '9router-public': { status: "disconnected", keyInput: "", showInput: false, validating: false },
  });
  const [localProviderModels, setLocalProviderModels] = useState<Record<string, string[]>>({});

  useEffect(() => {
    try {
      const saved = get9RouterPublicConfig();
      if (saved.models.length > 0) {
        setLocalProviderModels((prev) => ({ ...prev, '9router-public': saved.models }));
      }
      if (saved.url && saved.models.length > 0) {
        setProviders((prev) => ({
          ...prev,
          '9router-public': { ...prev['9router-public'], status: 'connected', showInput: false },
        }));
      }
    } catch {
      // ignore
    }
  }, []);

  // Load client-side keys on mount → a saved key means the provider is connected
  useEffect(() => {
    const stored = getAllKeys();
    const present = Object.keys(stored).filter((p) => stored[p]);
    setProviders((prev) => {
      const updated = { ...prev };
      for (const p of Object.keys(updated)) {
        if (p === '9router' || p === '9router-public') {
          // 9Router is only connected if explicit key or user verified connection
          if (!stored[p] && p === '9router') {
            updated[p] = { ...updated[p], status: "disconnected" };
          } else if (stored[p]) {
            updated[p] = { ...updated[p], status: "connected" };
          }
        } else if (present.includes(p)) {
          updated[p] = { ...updated[p], status: "connected" };
        } else {
          updated[p] = { ...updated[p], status: "disconnected" };
        }
      }
      return updated;
    });
  }, []);

  const getSaved9RouterPublic = get9RouterPublicConfig;

  useEffect(() => {
    const saved = getSaved9RouterPublic();
    if (selectedProvider === '9router-public' && saved.models.length > 0 && !saved.models.includes(selectedModel)) {
      onProviderChange('9router-public', saved.selectedModel && saved.models.includes(saved.selectedModel) ? saved.selectedModel : saved.models[0]);
    }
  }, [selectedProvider, selectedModel, onProviderChange]);

  // Sync with modelsData whenever it changes
  useEffect(() => {
    if (modelsData) {
      const stored = getAllKeys();
      setProviders((prev) => {
        const updated = { ...prev };
        for (const [provider, status] of Object.entries(modelsData.status)) {
          if (updated[provider]) {
            if (provider === '9router') {
              // 9router is connected only if explicit key stored or server connected with valid setup
              const hasKey = !!stored['9router'];
              const isConn = hasKey || (status === "connected" && prev['9router']?.status === "connected");
              updated[provider] = {
                ...updated[provider],
                status: isConn ? "connected" : "disconnected",
              };
            } else {
              const hasLocalModels = (localProviderModels[provider] || []).length > 0;
              const publicReady = provider === '9router-public' ? !!getSaved9RouterPublic().url && hasLocalModels : hasLocalModels;
              updated[provider] = {
                ...updated[provider],
                status: publicReady ? "connected" : status,
                showInput: publicReady ? false : updated[provider].showInput,
              };
            }
          }
        }
        return updated;
      });
    }
  }, [modelsData, localProviderModels]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside, true);
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, [isOpen]);

  const handleConnectKey = async (provider: string) => {
    const state = providers[provider];
    const input = provider === '9router-public'
      ? `${state.urlInput || ''} ${state.keyInput || ''}`.trim()
      : state.keyInput.trim();
    if (!input) {
      toast.error("Please enter an API key first");
      return;
    }

    setProviders((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], validating: true },
    }));

    try {
      const validateRes = await axios.post(`${API_URL}/api/keys/validate`, {
        provider,
        api_key: input,
      });

      if (!validateRes.data.valid) {
        toast.error(validateRes.data.message || "Invalid API key");
        setProviders((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], validating: false },
        }));
        return;
      }

      const validatedModels = Array.isArray(validateRes.data.models) ? validateRes.data.models : [];
      const nextModel = validatedModels[0] || '';
      if (provider === '9router-public') {
        localStorage.setItem('9router_public', JSON.stringify({
          version: 1,
          url: state.urlInput || '',
          key: state.keyInput || '',
          models: validatedModels,
          selectedModel: nextModel,
        }));
      } else {
        // ponytail: store key in browser only - never sent to our server for storage
        setApiKey(provider, input);
      }
      if (validatedModels.length > 0) {
        setLocalProviderModels((prev) => ({ ...prev, [provider]: validatedModels }));
        onProviderChange(provider, nextModel);
      }

      const tokensInfo = validateRes.data.tokens !== undefined ? ` (tokens: ${validateRes.data.tokens})` : '';
      toast.success(`${PROVIDER_INFO[provider]?.label} connected successfully${tokensInfo}`);

      setProviders((prev) => ({
        ...prev,
        [provider]: {
          status: "connected",
          keyInput: "",
          urlInput: "",
          showInput: false,
          validating: false,
        },
      }));

      if (provider !== '9router-public') await refreshModels();
      if (validatedModels.length > 0) {
        setProviders((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], status: "connected", showInput: false, validating: false },
        }));
        onProviderChange(provider, nextModel);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to validate key");
      setProviders((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], validating: false },
      }));
    }
  };

  const [pingingModel, setPingingModel] = useState<string | null>(null);

  const handlePingSpecificModel = async (provider: string, modelToTest: string) => {
    if (!modelToTest) {
      toast.error("Please select a model first");
      return;
    }
    setPingingModel(modelToTest);
    const pingToast = toast.loading(`Testing model "${modelToTest}"...`);
    try {
      const saved9Router = provider === '9router-public' ? getSaved9RouterPublic() : EMPTY_9ROUTER_PUBLIC;
      const apiKey = provider === '9router-public'
        ? `${saved9Router.url || ''} ${saved9Router.key || ''}`.trim()
        : getApiKey(provider);

      const res = await axios.post(`${API_URL}/api/keys/validate`, {
        provider,
        model: modelToTest,
        ...(apiKey ? { api_key: apiKey } : {}),
      });

      toast.dismiss(pingToast);
      if (res.data.valid) {
        toast.success(`Model "${modelToTest}" is active & ready!`);
      } else {
        toast.error(res.data.message || `Model "${modelToTest}" failed validation`);
      }
    } catch (err: any) {
      toast.dismiss(pingToast);
      toast.error(err.response?.data?.detail || err.message || `Failed to test model "${modelToTest}"`);
    } finally {
      setPingingModel(null);
    }
  };

  // ponytail: Validate connection or refresh local 9Router models
  const handleCheck9Router = async () => {
    setProviders((prev) => ({
      ...prev,
      '9router': { ...prev['9router'], validating: true },
    }));

    const checkingToast = toast.loading("Refreshing 9Router models...");
    try {
      await refreshModels();

      const res = await axios.get<ModelsResponse>(`${API_URL}/api/models`);
      const status = res.data.status['9router'];

      toast.dismiss(checkingToast);

      if (status !== "connected") {
        toast.error("Could not reach 9Router on http://localhost:20128. Please run it locally first.");
        setProviders((prev) => ({
          ...prev,
          '9router': { ...prev['9router'], status: 'disconnected', validating: false },
        }));
        return;
      }

      const models = res.data.providers['9router'] || [];
      const targetModel = (selectedProvider === '9router' && models.includes(selectedModel))
        ? selectedModel
        : (models[0] || '');

      toast.success(`Connected to local 9Router (${models.length} model(s) available)`);
      setProviders((prev) => ({
        ...prev,
        '9router': {
          ...prev['9router'],
          status: "connected",
          validating: false,
        },
      }));
      if (selectedProvider === '9router' && targetModel) {
        onProviderChange('9router', targetModel);
      }
    } catch (err: any) {
      toast.dismiss(checkingToast);
      toast.error(err.response?.data?.detail || err.message || "Failed to reach 9Router.");
      setProviders((prev) => ({
        ...prev,
        '9router': {
          ...prev['9router'],
          validating: false,
        },
      }));
    }
  };

  // ponytail: Validate existing stored provider credential connectivity using the selected model
  const handlePingProvider = async (provider: string) => {
    setProviders((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], validating: true },
    }));

    const models = localProviderModels[provider] || modelsData?.providers[provider] || [];
    const targetModel = (selectedProvider === provider && models.includes(selectedModel))
      ? selectedModel
      : (models[0] || '');
    const saved9Router = provider === '9router-public' ? getSaved9RouterPublic() : EMPTY_9ROUTER_PUBLIC;
    const apiKey = provider === '9router-public'
      ? `${saved9Router.url || ''} ${saved9Router.key || ''}`.trim()
      : getApiKey(provider);
    if (provider === '9router-public' && !saved9Router.url) {
      toast.error("Click update and enter the 9Router Public URL once.");
      setProviders((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          status: (localProviderModels[provider] || []).length > 0 ? "connected" : prev[provider].status,
          validating: false,
        },
      }));
      return;
    }

    const checkingToast = toast.loading(
      provider === '9router-public'
        ? `Refreshing ${PROVIDER_INFO[provider]?.label} models...`
        : `Pinging ${PROVIDER_INFO[provider]?.label} (model: ${targetModel || 'default'})...`
    );
    try {
      const res = await axios.post(`${API_URL}/api/keys/validate`, {
        provider,
        ...(provider === '9router-public' ? {} : { model: targetModel }),
        ...(apiKey ? { api_key: apiKey } : {}),
      });

      toast.dismiss(checkingToast);
      if (res.data.valid) {
        const validatedModels = Array.isArray(res.data.models) ? res.data.models : [];
        if (provider === '9router-public' && validatedModels.length > 0) {
          const nextModel = validatedModels.includes(saved9Router.selectedModel || '')
            ? saved9Router.selectedModel || ''
            : validatedModels.includes(targetModel)
              ? targetModel
              : validatedModels[0];
          setLocalProviderModels((prev) => ({ ...prev, [provider]: validatedModels }));
          localStorage.setItem('9router_public', JSON.stringify({
            ...saved9Router,
            version: 1,
            models: validatedModels,
            selectedModel: nextModel,
          }));
          onProviderChange(provider, nextModel);
        }
        const tokensInfo = res.data.tokens !== undefined ? ` (tokens: ${res.data.tokens})` : '';
        toast.success(`${PROVIDER_INFO[provider]?.label} connected successfully${targetModel && provider !== '9router-public' ? ` (model: ${targetModel})` : ''}${tokensInfo}!`);
        setProviders((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            status: "connected",
            validating: false,
          },
        }));
        if (provider !== '9router-public') await refreshModels();
        if (provider === '9router-public') {
          setProviders((prev) => ({
            ...prev,
            [provider]: { ...prev[provider], status: "connected", validating: false },
          }));
        }
      } else {
        toast.error(res.data.message || `Could not connect to ${PROVIDER_INFO[provider]?.label}`);
        setProviders((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            status: provider === '9router-public' && (localProviderModels[provider] || []).length > 0 ? "connected" : "has_key",
            validating: false,
          },
        }));
      }
    } catch (err: any) {
      toast.dismiss(checkingToast);
      toast.error(err.response?.data?.detail || `Failed to ping ${PROVIDER_INFO[provider]?.label}`);
      setProviders((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          status: provider === '9router-public' && (localProviderModels[provider] || []).length > 0 ? "connected" : prev[provider].status,
          validating: false,
        },
      }));
    }
  };

  useEffect(() => {
    const saved = getSaved9RouterPublic();
    if (saved.url && saved.models.length > 0) handlePingProvider('9router-public').catch(() => {});
  }, []);

  const handleRevoke = async (provider: string) => {
    try {
      if (provider === '9router-public') {
        localStorage.removeItem('9router_public');
        setLocalProviderModels((prev) => {
          const next = { ...prev };
          delete next['9router-public'];
          return next;
        });
        setProviders((prev) => ({
          ...prev,
          [provider]: { status: "disconnected", keyInput: "", showInput: false, validating: false },
        }));
        toast.success(`${PROVIDER_INFO[provider]?.label} disconnected`);
        if (selectedProvider === provider) onProviderChange("", "");
        return;
      }

      removeApiKey(provider);

      setProviders((prev) => ({
        ...prev,
        [provider]: { status: "disconnected", keyInput: "", showInput: false, validating: false },
      }));

      toast.success(`${PROVIDER_INFO[provider]?.label} disconnected`);

      if (selectedProvider === provider) {
        onProviderChange("", "");
      }

      if (provider !== '9router') {
        await refreshModels();
      }
    } catch {
      toast.error("Failed to revoke key");
    }
  };

  const handleUpdate = (provider: string) => {
    const saved9Router = provider === '9router-public' ? getSaved9RouterPublic() : EMPTY_9ROUTER_PUBLIC;
    setProviders((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        showInput: true,
        keyInput: provider === '9router-public' ? (saved9Router.key || "") : "",
        urlInput: provider === '9router-public' ? (saved9Router.url || "") : prev[provider].urlInput,
      },
    }));
  };

  const handleAddKey = (provider: string) => {
    const saved9Router = provider === '9router-public' ? getSaved9RouterPublic() : EMPTY_9ROUTER_PUBLIC;
    setProviders((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        showInput: !prev[provider].showInput,
        keyInput: provider === '9router-public' ? (saved9Router.key || prev[provider].keyInput) : prev[provider].keyInput,
        urlInput: provider === '9router-public' ? (saved9Router.url || prev[provider].urlInput) : prev[provider].urlInput,
      },
    }));
  };

  const handleUseProvider = (provider: string) => {
    if (providers[provider]?.status !== "connected") {
      toast.error("Connect this provider first.");
      return;
    }
    const models = localProviderModels[provider] || modelsData?.providers[provider] || [];
    const saved9Router = provider === '9router-public' ? getSaved9RouterPublic() : EMPTY_9ROUTER_PUBLIC;
    const firstModel = provider === '9router-public' && models.includes(saved9Router.selectedModel || '')
      ? saved9Router.selectedModel || ''
      : models[0] || "";
    onProviderChange(provider, firstModel);
    // ponytail: Do not auto close on provider change as requested
    toast.success(`Switched to ${PROVIDER_INFO[provider]?.label}`);
  };

  const handleSelectModel = (model: string) => {
    if (selectedProvider === '9router-public') {
      const saved9Router = getSaved9RouterPublic();
      localStorage.setItem('9router_public', JSON.stringify({
        ...saved9Router,
        version: 1,
        selectedModel: model,
      }));
    }
    onProviderChange(selectedProvider, model);
    // ponytail: Do not auto close on model selection as requested
  };

  const renderStatusDot = (status: ConnectionStatus) => {
    if (status === "connected") {
      return <span className="w-2 h-2 rounded-full bg-emerald-500"></span>;
    }
    if (status === "has_key") {
      return <span className="w-2 h-2 rounded-full bg-amber-500"></span>;
    }
    return <span className="w-2 h-2 rounded-full bg-slate-300"></span>;
  };

  const connectedCount = Object.values(providers).filter((p) => p.status === "connected").length;

  if (inline) {
    return (
      <div className="space-y-3">
        {Object.entries(PROVIDER_INFO).filter(([p]) => (p === '9router' ? isLocal : p === '9router-public' ? !isLocal : true)).map(([provider, info]) => {
          const state = providers[provider] || { status: "disconnected", keyInput: "", showInput: false, validating: false };
          const isActive = selectedProvider === provider && state?.status === "connected";

          return (
            <div
              key={provider}
              className={`border rounded-lg p-4 transition-all ${
                isActive
                  ? "border-indigo-200 bg-indigo-50/50 ring-1 ring-indigo-100"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              {/* Provider Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${info.color}`}></div>
                  <span className="font-medium text-sm text-slate-800">{info.label}</span>
                  {renderStatusDot(state.status)}
                  {isActive && (
                    <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">
                      ACTIVE
                    </span>
                  )}
                  {state.status === "connected" && (
                    <span className="hidden sm:inline text-[10px] text-slate-400 font-mono truncate max-w-40" title={provider === '9router-public' ? getSaved9RouterPublic().url : undefined}>
                      {provider === '9router-public'
                        ? `${maskText(getSaved9RouterPublic().url, true)} / ${maskText(getSaved9RouterPublic().key)}`
                        : maskText(getApiKey(provider))}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {provider === '9router' ? (
                    state.status === "connected" ? (
                      <>
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleUseProvider(provider)}
                            className="px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 transition"
                          >
                            Use
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleCheck9Router}
                          disabled={state.validating}
                          className="p-1 rounded hover:bg-slate-100 transition"
                          title="Refresh 9Router status"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${state.validating ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(provider)}
                          className="p-1 rounded hover:bg-red-50 transition"
                          title="Revoke / disconnect 9Router"
                        >
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCheck9Router}
                        disabled={state.validating}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                      >
                        <RefreshCw className={`w-3 h-3 ${state.validating ? "animate-spin" : ""}`} />
                        Check Connection
                      </button>
                    )
                  ) : state.status === "connected" ? (
                    <>
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => handleUseProvider(provider)}
                          className="px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 transition"
                        >
                          Use
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePingProvider(provider)}
                        disabled={state.validating}
                        className="p-1 rounded hover:bg-slate-100 transition"
                        title={provider === '9router-public' ? "Refresh user models" : "Check connection"}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${state.validating ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdate(provider)}
                        className="p-1 rounded hover:bg-slate-100 transition"
                        title="Update key"
                      >
                        <Key className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(provider)}
                        className="p-1 rounded hover:bg-red-50 transition"
                        title="Revoke key"
                      >
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-1">
                      {state.status === "has_key" && (
                        <button
                          type="button"
                          onClick={() => handlePingProvider(provider)}
                          disabled={state.validating}
                          className="p-1 rounded hover:bg-slate-100 transition"
                          title={provider === '9router-public' ? "Refresh user models" : "Check connection"}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${state.validating ? "animate-spin" : ""}`} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAddKey(provider)}
                        className={state.status === "has_key"
                          ? `p-1 rounded transition ${state.showInput ? "hover:bg-red-50" : "hover:bg-slate-100"}`
                          : `flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition ${
                          state.showInput
                            ? "text-red-500 bg-red-50 hover:bg-red-100"
                            : "text-slate-600 bg-slate-100 hover:bg-slate-200"
                        }`}
                        title={state.showInput ? "Cancel" : state.status === "has_key" ? "Update key" : "Add key"}
                      >
                        {state.showInput ? <X className={state.status === "has_key" ? "w-3.5 h-3.5 text-red-400" : "w-3 h-3"} /> : <Key className={state.status === "has_key" ? "w-3.5 h-3.5 text-slate-400" : "w-3 h-3"} />}
                        {state.status !== "has_key" && (state.showInput ? "Cancel" : "Add Key")}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tips for 9Router */}
              {provider === '9router' && state.status !== "connected" && (
                <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <p className="font-semibold text-slate-600 mb-0.5">How to install & run locally:</p>
                  <code className="block bg-slate-800 text-slate-200 px-2 py-1 rounded text-[11px] font-mono select-all">
                    npm install -g 9router && 9router
                  </code>
                </div>
              )}
              {provider === '9router-public' && state.status !== "connected" && (
                <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <p className="font-semibold text-slate-600 mb-0.5">Enter public URL and API key:</p>
                  <code className="block bg-slate-800 text-slate-200 px-2 py-1 rounded text-[11px] font-mono select-all">
                    https://your-domain.com/v1 sk-9router-...
                  </code>
                </div>
              )}

              {/* Key Input */}
              {state.showInput && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className={provider === '9router-public' ? "space-y-2" : "flex gap-2"}>
                    {provider === '9router-public' && (
                      <input
                        type="text"
                        value={state.urlInput || ""}
                        onChange={(e) =>
                          setProviders((prev) => ({
                            ...prev,
                            [provider]: { ...prev[provider], urlInput: e.target.value },
                          }))
                        }
                        placeholder="https://your-domain.com/v1"
                        className="input-field text-sm font-mono py-2"
                      />
                    )}
                    <input
                      type="password"
                      value={state.keyInput}
                      onChange={(e) =>
                        setProviders((prev) => ({
                          ...prev,
                          [provider]: { ...prev[provider], keyInput: e.target.value },
                        }))
                      }
                      placeholder={provider === '9router-public' ? "API key optional if Require API key is off" : info.placeholder}
                      className="input-field text-sm font-mono py-2"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleConnectKey(provider);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleConnectKey(provider)}
                      disabled={state.validating || !(provider === '9router-public' ? (state.urlInput || state.keyInput || '').trim() : state.keyInput.trim())}
                      className={provider === '9router-public' ? "btn-primary text-xs whitespace-nowrap px-3 w-full" : "btn-primary text-xs whitespace-nowrap px-3"}
                    >
                      {state.validating ? "..." : "Connect"}
                    </button>
                  </div>
                  <a
                    href={info.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-indigo-600 hover:text-indigo-700"
                  >
                    Get API key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Model Selector for active provider */}
              {isActive && !state.showInput && (localProviderModels[provider] || modelsData?.providers[provider]) && (
                <div className="mt-3 pt-3 border-t border-indigo-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-600 block">
                      Model{provider === '9router-public' ? ' (from your 9Router)' : ''}
                    </label>
                    {selectedModel && (
                      <button
                        type="button"
                        onClick={() => handlePingSpecificModel(provider, selectedModel)}
                        disabled={pingingModel === selectedModel}
                        className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition"
                        title="Test if selected model responds"
                      >
                        <RefreshCw className={`w-3 h-3 ${pingingModel === selectedModel ? "animate-spin text-indigo-600" : ""}`} />
                        <span>{pingingModel === selectedModel ? "Testing..." : "Test Model"}</span>
                      </button>
                    )}
                  </div>
                  <select
                    value={selectedModel}
                    onChange={(e) => handleSelectModel(e.target.value)}
                    className="input-field text-sm py-2"
                    aria-label={`Select model for ${info.label}`}
                  >
                    <option value="">- Select model -</option>
                    {(localProviderModels[provider] || modelsData?.providers[provider] || []).map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}

        <p className="text-[11px] text-slate-400 text-center mt-4">
          Keys are stored in your browser only and never sent to our server.
        </p>
      </div>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="btn-secondary flex items-center gap-2 text-sm"
      >
        <Settings className="w-4 h-4 text-slate-500" />
        <span className="hidden sm:inline text-slate-700">
          {selectedProvider && PROVIDER_INFO[selectedProvider]
            ? `${PROVIDER_INFO[selectedProvider].label} / ${selectedModel || "No model selected"}`
            : "Select AI Provider"
          }
        </span>
        {(!selectedProvider || !selectedModel) ? (
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        ) : providers[selectedProvider]?.status === "connected" ? (
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Connected"></span>
        ) : providers[selectedProvider]?.status === "has_key" ? (
          <span className="w-2 h-2 rounded-full bg-amber-500" title="Connection unverified"></span>
        ) : (
          <span className="w-2 h-2 rounded-full bg-slate-300" title="Disconnected"></span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Settings Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[420px] max-w-[420px] card shadow-dropdown z-50 p-5 max-h-[75vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">AI Provider</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage API keys and select your model
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md hover:bg-slate-100 transition"
              aria-label="Close settings panel"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {selectedProvider && !selectedModel && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              Please select a model for {PROVIDER_INFO[selectedProvider]?.label || selectedProvider}.
            </div>
          )}

          <div className="space-y-2">
            {Object.entries(PROVIDER_INFO).filter(([p]) => (p === '9router' ? isLocal : p === '9router-public' ? !isLocal : true)).map(([provider, info]) => {
              const state = providers[provider] || { status: "disconnected", keyInput: "", showInput: false, validating: false };
              const isActive = selectedProvider === provider && state?.status === "connected";

              return (
                <div
                  key={provider}
                  className={`border rounded-lg p-3 transition-all ${
                    isActive
                      ? "border-indigo-200 bg-indigo-50/50 ring-1 ring-indigo-100"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* Provider Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${info.color}`}></div>
                      <span className="font-medium text-sm text-slate-800">{info.label}</span>
                      {renderStatusDot(state.status)}
                      {isActive && (
                        <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">
                          ACTIVE
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {state.status === "connected" ? (
                        <>
                          {!isActive && (
                            <button
                              type="button"
                              onClick={() => handleUseProvider(provider)}
                              className="px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 transition"
                            >
                              Use
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={provider === '9router' ? handleCheck9Router : () => handlePingProvider(provider)}
                            disabled={state.validating}
                            className="p-1 rounded hover:bg-slate-100 transition"
                            title={provider === '9router-public' ? "Refresh user models" : "Check connection"}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${state.validating ? "animate-spin" : ""}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdate(provider)}
                            className="p-1 rounded hover:bg-slate-100 transition"
                            title="Update key"
                          >
                            <Key className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevoke(provider)}
                            className="p-1 rounded hover:bg-red-50 transition"
                            title="Revoke key"
                          >
                            <X className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1">
                          {state.status === "has_key" && (
                            <button
                              type="button"
                              onClick={provider === '9router' ? handleCheck9Router : () => handlePingProvider(provider)}
                              disabled={state.validating}
                              className="p-1 rounded hover:bg-slate-100 transition"
                              title={provider === '9router-public' ? "Refresh user models" : "Check connection"}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${state.validating ? "animate-spin" : ""}`} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAddKey(provider)}
                            className={state.status === "has_key"
                              ? `p-1 rounded transition ${state.showInput ? "hover:bg-red-50" : "hover:bg-slate-100"}`
                              : `flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition ${
                              state.showInput
                                ? "text-red-500 bg-red-50 hover:bg-red-100"
                                : "text-slate-600 bg-slate-100 hover:bg-slate-200"
                            }`}
                            title={state.showInput ? "Cancel" : state.status === "has_key" ? "Update key" : "Add key"}
                          >
                            {state.showInput ? <X className={state.status === "has_key" ? "w-3.5 h-3.5 text-red-400" : "w-3 h-3"} /> : <Key className={state.status === "has_key" ? "w-3.5 h-3.5 text-slate-400" : "w-3 h-3"} />}
                            {state.status !== "has_key" && (state.showInput ? "Cancel" : "Add Key")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tips for 9Router */}
                  {provider === '9router' && state.status !== "connected" && (
                    <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <p className="font-semibold text-slate-600 mb-0.5">How to install & run locally:</p>
                      <code className="block bg-slate-800 text-slate-200 px-2 py-1 rounded text-[11px] font-mono select-all">
                        npm install -g 9router && 9router
                      </code>
                    </div>
                  )}

                  {/* Key Input */}
                  {state.showInput && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className={provider === '9router-public' ? "space-y-2" : "flex gap-2"}>
                        {provider === '9router-public' && (
                          <input
                            type="text"
                            value={state.urlInput || ""}
                            onChange={(e) =>
                              setProviders((prev) => ({
                                ...prev,
                                [provider]: { ...prev[provider], urlInput: e.target.value },
                              }))
                            }
                            placeholder="https://your-domain.com/v1"
                            className="input-field text-sm font-mono py-2"
                          />
                        )}
                        <input
                          type="password"
                          value={state.keyInput}
                          onChange={(e) =>
                            setProviders((prev) => ({
                              ...prev,
                              [provider]: { ...prev[provider], keyInput: e.target.value },
                            }))
                          }
                          placeholder={provider === '9router-public' ? "API key optional if Require API key is off" : info.placeholder}
                          className="input-field text-sm font-mono py-2"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleConnectKey(provider);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleConnectKey(provider)}
                          disabled={state.validating || !(provider === '9router-public' ? (state.urlInput || state.keyInput || '').trim() : state.keyInput.trim())}
                          className={provider === '9router-public' ? "btn-primary text-xs whitespace-nowrap px-3 w-full" : "btn-primary text-xs whitespace-nowrap px-3"}
                        >
                          {state.validating ? "..." : "Connect"}
                        </button>
                      </div>
                      <a
                        href={info.docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs text-indigo-600 hover:text-indigo-700"
                      >
                        Get API key <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Model Selector for active provider */}
                  {isActive && (localProviderModels[provider] || modelsData?.providers[provider]) && (
                    <div className="mt-3 pt-3 border-t border-indigo-100">
                      <label className="text-xs font-medium text-slate-600 block mb-1.5">
                        Model{provider === '9router-public' ? ' (from your 9Router)' : ''}
                      </label>
                      <select
                        value={selectedModel}
                        onChange={(e) => handleSelectModel(e.target.value)}
                        className="input-field text-sm py-2"
                        aria-label={`Select model for ${info.label}`}
                      >
                        <option value="">- Select model -</option>
                        {(localProviderModels[provider] || modelsData?.providers[provider] || []).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-400 text-center">
              Keys are stored in your browser only and never sent to our server.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
