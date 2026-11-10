import { Injectable, Logger } from '@nestjs/common';
import { AiProviderKind } from '@prisma/client';

export type AiRuntimeConfig = {
  provider: AiProviderKind;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  retryCount: number;
  systemPrompt: string;
};

export type RewriteResult = {
  text: string;
  provider: AiProviderKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
};

/** Approximate USD per 1M tokens for cost tracking */
const COST_PER_MILLION: Record<string, { in: number; out: number }> = {
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gemini-2.0-flash-lite': { in: 0.075, out: 0.3 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
  default: { in: 0.5, out: 2.0 },
};

@Injectable()
export class AiRewriteService {
  private readonly log = new Logger(AiRewriteService.name);

  async testProvider(config: AiRuntimeConfig) {
    const started = Date.now();
    const result = await this.callProvider(config, 'Тест соединения. Ответь одним словом: OK');
    return {
      ok: true,
      latencyMs: Date.now() - started,
      model: config.model,
      provider: config.provider,
      sample: result.text.slice(0, 100),
      tokens: result.totalTokens,
    };
  }

  async rewriteNewsText(originalText: string, config: AiRuntimeConfig): Promise<RewriteResult> {
    const runtime = config;
    const started = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= runtime.retryCount; attempt++) {
      try {
        const result = await this.callProvider(runtime, originalText);
        const durationMs = Date.now() - started;
        return { ...result, durationMs, provider: runtime.provider, model: runtime.model };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.log.warn(
          `Rewrite attempt ${attempt + 1}/${runtime.retryCount + 1} failed: ${lastError.message}`,
        );
        if (attempt < runtime.retryCount) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw lastError ?? new Error('Rewrite failed');
  }

  private async callProvider(config: AiRuntimeConfig, userText: string) {
    switch (config.provider) {
      case 'OPENAI':
        return this.callOpenAiCompatible(
          'https://api.openai.com/v1/chat/completions',
          config,
          userText,
          {},
        );
      case 'OPENROUTER':
        return this.callOpenAiCompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          config,
          userText,
          {
            'HTTP-Referer': process.env.APP_URL ?? process.env.PUBLIC_SITE_URL ?? 'https://yugaktsent.neeklo.ru',
            'X-Title': 'YugAktsent News',
          },
        );
      case 'GEMINI':
        return this.callGemini(config, userText);
      case 'CLAUDE':
        return this.callClaude(config, userText);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  private async callOpenAiCompatible(
    url: string,
    config: AiRuntimeConfig,
    userText: string,
    extraHeaders: Record<string, string>,
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          messages: [
            { role: 'system', content: config.systemPrompt },
            { role: 'user', content: userText },
          ],
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      if (!res.ok) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Empty AI response');
      const inputTokens = json.usage?.prompt_tokens ?? 0;
      const outputTokens = json.usage?.completion_tokens ?? 0;
      const totalTokens = json.usage?.total_tokens ?? inputTokens + outputTokens;
      return {
        text,
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: this.estimateCost(config.model, inputTokens, outputTokens),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async callGemini(config: AiRuntimeConfig, userText: string) {
    const model = config.model || 'gemini-2.0-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: config.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
          },
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };
      if (!res.ok) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) throw new Error('Empty Gemini response');
      const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
      const totalTokens = json.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;
      return {
        text,
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: this.estimateCost(model, inputTokens, outputTokens),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async callClaude(config: AiRuntimeConfig, userText: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'claude-3-5-haiku-latest',
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          system: config.systemPrompt,
          messages: [{ role: 'user', content: userText }],
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as {
        error?: { message?: string };
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      if (!res.ok) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      const text = json.content?.[0]?.text?.trim();
      if (!text) throw new Error('Empty Claude response');
      const inputTokens = json.usage?.input_tokens ?? 0;
      const outputTokens = json.usage?.output_tokens ?? 0;
      return {
        text,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd: this.estimateCost(config.model, inputTokens, outputTokens),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const key = Object.keys(COST_PER_MILLION).find((k) => model.includes(k)) ?? 'default';
    const rates = COST_PER_MILLION[key] ?? COST_PER_MILLION.default;
    return (inputTokens * rates.in + outputTokens * rates.out) / 1_000_000;
  }
}
