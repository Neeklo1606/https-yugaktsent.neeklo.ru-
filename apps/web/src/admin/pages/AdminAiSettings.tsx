import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CheckCircle2,
  Loader2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ApiError, apiGet, apiPost, apiPut } from '@/lib/api';
import { toast } from '@/components/ui/sonner';

type AiProviderKind = 'OPENAI' | 'OPENROUTER' | 'GEMINI' | 'CLAUDE';

type ProviderRow = {
  provider: AiProviderKind;
  isEnabled: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  defaultModel: string | null;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  retryCount: number;
  systemPrompt: string;
  totalCostUsd: string;
  totalTokens: number;
  availableModels: string[];
};

type ImageGenerationSettings = {
  enabled: boolean;
  model: string;
  size: string;
  timeoutMs: number;
  availableModels: string[];
  availableSizes: string[];
  openAiConfigured: boolean;
};

type AiSettingsResponse = {
  activeProvider: AiProviderKind | null;
  imageGeneration: ImageGenerationSettings;
  providers: ProviderRow[];
};

const PROVIDER_LABELS: Record<AiProviderKind, string> = {
  OPENAI: 'OpenAI',
  OPENROUTER: 'OpenRouter',
  GEMINI: 'Google Gemini',
  CLAUDE: 'Anthropic Claude',
};

function formatApiError(e: unknown): string {
  if (e instanceof ApiError) return e.message || `${e.status}`;
  return e instanceof Error ? e.message : 'Ошибка';
}

export default function AdminAiSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'settings', 'ai'],
    queryFn: () => apiGet<AiSettingsResponse>('/admin/settings/ai'),
  });

  const [activeProvider, setActiveProvider] = useState<AiProviderKind | ''>('');
  const [imageDraft, setImageDraft] = useState<ImageGenerationSettings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<ProviderRow & { apiKey: string }>>>({});
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<AiProviderKind | null>(null);

  useEffect(() => {
    if (!data) return;
    setActiveProvider(data.activeProvider ?? '');
    setImageDraft(data.imageGeneration);
    const next: typeof drafts = {};
    for (const p of data.providers) {
      next[p.provider] = { ...p, apiKey: '' };
    }
    setDrafts(next);
  }, [data]);

  const saveProvider = useMutation({
    mutationFn: async (provider: AiProviderKind) => {
      const d = drafts[provider];
      if (!d) return;
      return apiPut(`/admin/settings/ai/${provider}`, {
        isEnabled: d.isEnabled,
        apiKey: d.apiKey ? d.apiKey : d.hasApiKey ? '__UNCHANGED__' : '',
        defaultModel: d.defaultModel,
        temperature: d.temperature,
        maxTokens: d.maxTokens,
        timeoutMs: d.timeoutMs,
        retryCount: d.retryCount,
        systemPrompt: d.systemPrompt,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings', 'ai'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('Настройки AI сохранены');
    },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const saveImageGeneration = useMutation({
    mutationFn: () => {
      if (!imageDraft) return Promise.resolve();
      return apiPut('/admin/settings/ai/image-generation', {
        enabled: imageDraft.enabled,
        model: imageDraft.model,
        size: imageDraft.size,
        timeoutMs: imageDraft.timeoutMs,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings', 'ai'] });
      toast.success('Настройки генерации обложек сохранены');
    },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const saveActive = useMutation({
    mutationFn: () =>
      apiPut('/admin/settings/ai/active-provider', {
        provider: activeProvider || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings', 'ai'] });
      toast.success('Активный провайдер обновлён');
    },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const testConnection = async (provider: AiProviderKind) => {
    setTesting(provider);
    try {
      await saveProvider.mutateAsync(provider);
      const res = await apiPost<{ ok: boolean; latencyMs: number; sample: string }>(
        `/admin/settings/ai/${provider}/test`,
        {},
      );
      toast.success(`Соединение OK (${res.latencyMs} ms): ${res.sample}`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setTesting(null);
    }
  };

  const patchDraft = (provider: AiProviderKind, patch: Partial<ProviderRow & { apiKey: string }>) => {
    setDrafts((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Нейросети
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Рерайт новостей и генерация обложек DALL-E. API-ключи задаются здесь и шифруются на сервере.
          </p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
            <CheckCircle2 className="w-4 h-4" /> Сохранено
          </span>
        )}
      </div>

      {imageDraft ? (
        <div className="bg-background border rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-sm">Обложки новостей (DALL-E 3)</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Используется API-ключ провайдера <strong>OpenAI</strong> ниже. Больше ничего настраивать не нужно.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={imageDraft.enabled}
                onChange={(e) => setImageDraft((d) => (d ? { ...d, enabled: e.target.checked } : d))}
              />
              Включено
            </label>
          </div>
          {!imageDraft.openAiConfigured ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Включите провайдер OpenAI и сохраните API-ключ в блоке ниже.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium block mb-1">Модель</label>
              <select
                value={imageDraft.model}
                onChange={(e) => {
                  const model = e.target.value;
                  const sizes =
                    model === 'dall-e-3'
                      ? ['1024x1024', '1792x1024', '1024x1792']
                      : ['256x256', '512x512', '1024x1024'];
                  setImageDraft((d) =>
                    d
                      ? {
                          ...d,
                          model,
                          size: sizes.includes(d.size) ? d.size : (sizes[0] ?? d.size),
                          availableSizes: sizes,
                        }
                      : d,
                  );
                }}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              >
                {imageDraft.availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Размер</label>
              <select
                value={imageDraft.size}
                onChange={(e) => setImageDraft((d) => (d ? { ...d, size: e.target.value } : d))}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              >
                {imageDraft.availableSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Таймаут (мс)</label>
              <input
                type="number"
                min={10000}
                max={300000}
                step={1000}
                value={imageDraft.timeoutMs}
                onChange={(e) =>
                  setImageDraft((d) => (d ? { ...d, timeoutMs: Number(e.target.value) } : d))
                }
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => saveImageGeneration.mutate()}
            disabled={saveImageGeneration.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {saveImageGeneration.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Сохранить настройки обложек
          </button>
        </div>
      ) : null}

      <div className="bg-background border rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-sm">Провайдер по умолчанию для рерайта</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={activeProvider}
            onChange={(e) => setActiveProvider(e.target.value as AiProviderKind | '')}
            className="border rounded-xl px-3 py-2 text-sm min-w-[200px]"
          >
            <option value="">— не выбран —</option>
            {(data?.providers ?? [])
              .filter((p) => p.isEnabled && p.hasApiKey)
              .map((p) => (
                <option key={p.provider} value={p.provider}>
                  {PROVIDER_LABELS[p.provider]}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => saveActive.mutate()}
            disabled={saveActive.isPending}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            Применить
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {(data?.providers ?? []).map((p) => {
          const d = drafts[p.provider] ?? p;
          return (
            <div key={p.provider} className="bg-background border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
                <div className="flex items-center gap-3">
                  <Bot className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="font-semibold">{PROVIDER_LABELS[p.provider]}</div>
                    <div className="text-xs text-muted-foreground">
                      Токены: {p.totalTokens.toLocaleString()} · ${Number(p.totalCostUsd).toFixed(4)}
                    </div>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(d.isEnabled)}
                    onChange={(e) => patchDraft(p.provider, { isEnabled: e.target.checked })}
                  />
                  Включён
                </label>
              </div>

              <div className="p-5 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="text-sm font-medium block mb-1">API ключ</label>
                  <input
                    type="password"
                    placeholder={p.apiKeyMasked ?? 'Введите API ключ'}
                    value={d.apiKey ?? ''}
                    onChange={(e) => patchDraft(p.provider, { apiKey: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
                    autoComplete="off"
                  />
                  {p.apiKeyMasked && !d.apiKey && (
                    <p className="text-xs text-muted-foreground mt-1">Текущий: {p.apiKeyMasked}</p>
                  )}
                  {p.provider === 'OPENAI' ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      Этот ключ также используется для генерации обложек новостей (DALL-E).
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Модель</label>
                  <select
                    value={d.defaultModel ?? ''}
                    onChange={(e) => patchDraft(p.provider, { defaultModel: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  >
                    {(p.availableModels.length ? p.availableModels : [d.defaultModel ?? '']).filter(Boolean).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Temperature</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={2}
                    value={d.temperature ?? 0.7}
                    onChange={(e) => patchDraft(p.provider, { temperature: Number(e.target.value) })}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Max tokens</label>
                  <input
                    type="number"
                    value={d.maxTokens ?? 2048}
                    onChange={(e) => patchDraft(p.provider, { maxTokens: Number(e.target.value) })}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Timeout (ms)</label>
                  <input
                    type="number"
                    value={d.timeoutMs ?? 60000}
                    onChange={(e) => patchDraft(p.provider, { timeoutMs: Number(e.target.value) })}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Retry count</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={d.retryCount ?? 2}
                    onChange={(e) => patchDraft(p.provider, { retryCount: Number(e.target.value) })}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm font-medium block mb-1">System prompt</label>
                  <textarea
                    rows={6}
                    value={d.systemPrompt ?? ''}
                    onChange={(e) => patchDraft(p.provider, { systemPrompt: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="px-5 py-4 border-t flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => saveProvider.mutate(p.provider)}
                  disabled={saveProvider.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {saveProvider.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => testConnection(p.provider)}
                  disabled={testing === p.provider}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium disabled:opacity-50"
                >
                  {testing === p.provider ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Тест соединения
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
