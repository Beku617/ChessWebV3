import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { Modal } from "../../components/settings";
import { useSettingsStore } from "../../store/settingsStore";
import {
  ANALYSIS_AI_PROVIDERS,
  getAnalysisAiModelById,
  getAnalysisAiModelsForProvider,
  getProviderEnvHint,
  type AnalysisAiProviderId,
} from "../../utils/analysisAiModels";
import { fetchAiProviderStatus, getAiProviderStatus } from "../../utils/groqApi";

function providerColor(providerId: AnalysisAiProviderId): string {
  switch (providerId) {
    case "anthropic":
      return "from-orange-500/90 to-amber-500/90";
    case "groq":
      return "from-rose-500/90 to-orange-500/90";
    default:
      return "from-gray-500 to-gray-600";
  }
}

export function AnalysisAiModelSelector() {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.update);
  const selectedModel = useMemo(
    () => getAnalysisAiModelById(settings.analysisAiModelId),
    [settings.analysisAiModelId],
  );

  const [providerStatus, setProviderStatus] = useState(() =>
    getAiProviderStatus(settings.analysisAiModelId),
  );
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<AnalysisAiProviderId>(
    selectedModel.providerId,
  );

  useEffect(() => {
    setActiveProvider(selectedModel.providerId);
  }, [selectedModel.providerId]);

  useEffect(() => {
    let cancelled = false;
    fetchAiProviderStatus(settings.analysisAiModelId)
      .then((status) => {
        if (!cancelled) setProviderStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setProviderStatus(getAiProviderStatus(settings.analysisAiModelId));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [settings.analysisAiModelId]);

  const configuredByProvider: Record<AnalysisAiProviderId, boolean> = {
    anthropic: providerStatus.anthropicConfigured,
    groq: providerStatus.groqConfigured,
  };

  const modelsForActiveProvider = useMemo(
    () => getAnalysisAiModelsForProvider(activeProvider),
    [activeProvider],
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
      >
        <Sparkles className="h-4 w-4 text-brand-500" />
        <span className="truncate max-w-[180px]">{selectedModel.name}</span>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("analysis.aiModelSelectorTitle")}
        maxWidth="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-theme-glass bg-[var(--glass-surface-soft)] px-4 py-3 text-xs text-gray-600 dark:text-gray-300"> <Trans>Selected model is applied to all game analysis views (User Analyze, Analyze960, and Admin Analyze), including AI explanations for Mistake, Blunder, and Brilliant moves.</Trans> </div>

          <div className="grid gap-4 md:grid-cols-[250px,minmax(0,1fr)]">
            <div className="theme-glass-panel-soft rounded-2xl p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400"> <Trans>Providers</Trans> </h3>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1 premium-scrollbar">
                {ANALYSIS_AI_PROVIDERS.map((provider) => {
                  const isActive = provider.id === activeProvider;
                  const isConfigured = configuredByProvider[provider.id];
                  return (
                    <button
                      key={provider.id}
                      onClick={() => setActiveProvider(provider.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                        isActive
                          ? "border-brand-500/70 bg-brand-500/10"
                          : "border-gray-200 bg-white/70 hover:bg-gray-100 dark:border-gray-700 dark:bg-slate-900/60 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${providerColor(
                              provider.id,
                            )}`}
                          >
                            {provider.logo}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {provider.name}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isConfigured
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          }`}
                        >
                          {isConfigured ? "Connected" : "Need Key"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="theme-glass-panel-soft rounded-2xl p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400"> <Trans>Models</Trans> </h3>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1 premium-scrollbar">
                {modelsForActiveProvider.map((model) => {
                  const isSelected = model.id === selectedModel.id;
                  const isConfigured = configuredByProvider[model.providerId];
                  return (
                    <button
                      key={model.id}
                      onClick={() =>
                        updateSetting("analysisAiModelId", model.id)
                      }
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? "border-brand-500/70 bg-brand-500/10"
                          : "border-gray-200 bg-white/70 hover:bg-gray-100 dark:border-gray-700 dark:bg-slate-900/60 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                              {model.name}
                            </p>
                            {model.versionBadge && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {model.versionBadge}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400"> <Trans>Input:</Trans> {model.input}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400"> <Trans>Output:</Trans> {model.output}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400"> <Trans>Max input:</Trans> {model.maxInputTokens}
                          </p>
                          {!isConfigured && (
                            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                              {getProviderEnvHint(model.providerId)}
                            </p>
                          )}
                        </div>
                        {isSelected && (
                          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
