import { buildSystemPrompt, formatMemoriesForPrompt } from '../constants/modelfile';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storageService } from './storageService';
import { xaiOauthService, XaiOAuthTokens } from './xaiOauthService';


export type AuthMode = 'api_key' | 'oauth';

export type AIProvider = 'xai' | 'ollama' | 'openrouter' | 'openai' | 'anthropic';

export interface ProviderInfo {
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  needsApiKey: boolean;
  apiKeyHint: string;
}

export const PROVIDER_INFO: Record<AIProvider, ProviderInfo> = {
  xai: {
    label: '✦ Grok (xAI)',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
    needsApiKey: true,
    apiKeyHint:
      'Login with SuperGrok / X Premium above, or paste an API key from https://console.grok.x.ai',
  },
  ollama: {
    label: 'Ollama — Local',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    defaultModel: 'gemma:latest',
    needsApiKey: false,
    apiKeyHint: '',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    needsApiKey: true,
    apiKeyHint: 'Get your key at https://openrouter.ai/keys',
  },
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    needsApiKey: true,
    apiKeyHint: 'Get your key at https://platform.openai.com/api-keys',
  },
  anthropic: {
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    needsApiKey: true,
    apiKeyHint: 'Get your key at https://console.anthropic.com',
  },
};

export const PROVIDER_OPTIONS: { id: AIProvider; label: string }[] = (
  Object.entries(PROVIDER_INFO) as [AIProvider, ProviderInfo][]
).map(([id, info]) => ({ id, label: info.label }));

export interface OllamaConfig {
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  connected: boolean;
  /** How Grok authenticates — OAuth subscription or developer API key */
  authMode?: AuthMode;
  oauthEmail?: string;
}

export const XAI_BASE_URL = 'https://api.x.ai/v1';
export const XAI_DEFAULT_MODEL = 'grok-3';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaResponse {
  message: {
    role: string;
    content: string;
  };
}

export type StreamHandlers = {
  onChunk: (delta: string, fullText: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
};

const CONFIG_KEY = 'ollama_config';
const LOCAL_URL_KEY = 'pw_local_ollama_url';
const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_AURA = '#7df5d8';
const LOCAL_OLLAMA_CANDIDATES = [
  'http://127.0.0.1:11434',
  'http://localhost:11434',
];

class OllamaService {
  private config: OllamaConfig = {
    provider: 'xai',
    baseUrl: DEFAULT_BASE_URL,
    apiKey: '',
    model: XAI_DEFAULT_MODEL,
    connected: false,
    authMode: 'api_key',
  };

  private get isCloudProvider(): boolean {
    return this.config.provider !== 'ollama';
  }

  private get providerInfo(): ProviderInfo {
    return PROVIDER_INFO[this.config.provider] ?? PROVIDER_INFO.xai;
  }

  private get normalizedBaseUrl(): string {
    const fallback = this.providerInfo.defaultBaseUrl;
    const base = (this.config.baseUrl && this.config.baseUrl.trim())
      ? this.config.baseUrl.trim().replace(/\/$/, '')
      : fallback;
    return base;
  }

  /** Bearer for cloud calls — SuperGrok OAuth token preferred, then API key. */
  async resolveBearerToken(): Promise<string | null> {
    if (this.config.provider === 'xai' && this.config.authMode === 'oauth') {
      const token = await xaiOauthService.getValidAccessToken();
      if (token) return token;
    }
    if (this.config.apiKey && this.config.apiKey.length >= 10) {
      return this.config.apiKey;
    }
    if (this.config.provider === 'xai') {
      // OAuth tokens may exist even if authMode wasn't set yet
      const token = await xaiOauthService.getValidAccessToken();
      if (token) return token;
    }
    return null;
  }

  async applyOAuthLogin(tokens: XaiOAuthTokens): Promise<OllamaConfig> {
    await xaiOauthService.saveTokens(tokens);
    const next: OllamaConfig = {
      ...this.config,
      provider: 'xai',
      baseUrl: XAI_BASE_URL,
      authMode: 'oauth',
      oauthEmail: tokens.email || tokens.displayName,
      connected: true,
      // Keep apiKey as silent fallback if already set
      model: this.config.model || XAI_DEFAULT_MODEL,
    };
    await this.saveConfig(next);
    return next;
  }

  async clearOAuthLogin(): Promise<OllamaConfig> {
    await xaiOauthService.clearTokens();
    const next: OllamaConfig = {
      ...this.config,
      authMode: 'api_key',
      oauthEmail: undefined,
      connected: !!this.config.apiKey,
    };
    await this.saveConfig(next);
    return next;
  }

  async loadConfig(): Promise<OllamaConfig> {
    try {
      const stored = await AsyncStorage.getItem(CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as OllamaConfig;
        if (parsed.provider && PROVIDER_INFO[parsed.provider]) {
          this.config = parsed;
        }
      }
      await xaiOauthService.loadTokens();
      if (xaiOauthService.isLoggedIn() && this.config.provider === 'xai' && !this.config.authMode) {
        this.config = { ...this.config, authMode: 'oauth' };
      }
    } catch (error) {
      console.error('Failed to load Ollama config:', error);
    }
    return this.config;
  }

  async saveConfig(config: OllamaConfig): Promise<void> {
    this.config = config;
    try {
      await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('Failed to save Ollama config:', error);
    }
  }

  getConfig(): OllamaConfig {
    return this.config;
  }

  setBaseUrl(baseUrl: string): void {
    this.config = { ...this.config, baseUrl };
  }

  async testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    this.config = { ...this.config };

    if (this.isCloudProvider) {
      return this.testCloudConnection();
    }

    try {
      const url = `${this.config.baseUrl}/api/tags`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: { name: string }) => m.name) || [];
        return { success: true, models };
      }
      return { success: false, error: `Server responded with ${response.status}` };
    } catch {
      return { success: false, error: 'Could not reach Ollama. Check your IP and make sure Ollama is running!' };
    }
  }

  private async testCloudConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    const providerName = this.providerInfo.label;
    const base = this.normalizedBaseUrl;
    const bearer = await this.resolveBearerToken();

    if (!bearer || bearer.length < 10) {
      if (this.config.provider === 'xai') {
        return {
          success: false,
          error: 'Login with SuperGrok / X Premium, or paste an API key.',
        };
      }
      return { success: false, error: `Please enter a valid ${providerName} API key.` };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const isAnthropic = this.config.provider === 'anthropic';
      const response = await fetch(`${base}/models`, {
        method: 'GET',
        headers: isAnthropic
          ? {
              'x-api-key': bearer,
              'anthropic-version': '2023-06-01',
            }
          : {
              Authorization: `Bearer ${bearer}`,
            },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const models = (data.data || data.models || [])
          .map((m: { id?: string; name?: string }) => m.id || m.name)
          .filter(Boolean)
          .slice(0, 12);
        return { success: true, models };
      }

      const errText = await response.text();
      return { success: false, error: `${providerName} rejected credentials: ${errText}` };
    } catch {
      return {
        success: false,
        error: `Could not reach ${providerName}. Check your internet and login.`,
      };
    }
  }

  /** Streaming chat — words arrive live; lantern can breathe with each chunk */
  async sendMessageStream(
    messages: Message[],
    handlers: StreamHandlers,
    _currentPartner: string = 'Partner',
  ): Promise<{ content: string; aura: string }> {
    const companion = await storageService.loadCompanion();
    const memoriesFile = await storageService.loadMemories();
    const systemPrompt = buildSystemPrompt({
      name: companion.name,
      story: companion.story,
      integratedMemories: formatMemoriesForPrompt(memoriesFile.memories),
    });

    const messagesWithSystem: Message[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    try {
      if (this.config.provider === 'anthropic') {
        const result = await this.sendCloudMessage(messagesWithSystem);
        handlers.onDone(result.content);
        return result;
      }

      if (this.isCloudProvider) {
        return await this.streamOpenAICompatible(messagesWithSystem, handlers);
      }

      return await this.streamOllama(messagesWithSystem, handlers);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Stream failed');
      handlers.onError(err);
      throw err;
    }
  }

  async sendMessage(
    messages: Message[],
    _currentPartner: string = 'Partner',
  ): Promise<{ content: string; aura: string }> {
    const companion = await storageService.loadCompanion();
    const memoriesFile = await storageService.loadMemories();
    const systemPrompt = buildSystemPrompt({
      name: companion.name,
      story: companion.story,
      integratedMemories: formatMemoriesForPrompt(memoriesFile.memories),
    });

    const messagesWithSystem: Message[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    try {
      if (this.isCloudProvider) {
        return this.sendCloudMessage(messagesWithSystem);
      }

      const url = `${this.config.baseUrl}/api/chat`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: messagesWithSystem,
          stream: false,
          keelalive: '30m',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data: OllamaResponse = await response.json();

      return {
        content: data.message.content.trim(),
        aura: DEFAULT_AURA,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Your partner is thinking... but it took too long. Try again!');
      }

      throw new Error(`Could not reach Ollama at ${this.config.baseUrl}`);
    }
  }

  /** Used by sleep/dream integration — custom system prompt, no companion context injection */
  async sendWithSystemPrompt(
    systemPrompt: string,
    userMessage: string,
  ): Promise<{ content: string; aura: string }> {
    await this.loadConfig();
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    if (this.isCloudProvider) {
      const bearer = await this.resolveBearerToken();
      if (!bearer || bearer.length < 10) {
        throw new Error(
          'SuperGrok login or API key needed for dream integration. Check your AI config.',
        );
      }
      return this.sendCloudMessage(messages);
    }

    return this.streamOllama(messages, {
      onChunk: () => {},
      onDone: () => {},
      onError: () => {},
    });
  }

  private async sendCloudMessage(
    messages: Message[],
  ): Promise<{ content: string; aura: string }> {
    if (this.config.provider === 'anthropic') {
      return this.sendAnthropicMessage(messages);
    }
    return this.sendOpenAICompatibleMessage(messages);
  }

  private async sendOpenAICompatibleMessage(
    messages: Message[],
  ): Promise<{ content: string; aura: string }> {
    const base = this.normalizedBaseUrl;
    const url = `${base}/chat/completions`;
    const model = this.config.model || this.providerInfo.defaultModel;
    const bearer = (await this.resolveBearerToken()) || this.config.apiKey;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
    };

    if (this.config.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://partnershipworld.app';
      headers['X-Title'] = 'PartnershipWorld';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.92,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.providerInfo.label} Error: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "I'm right here with you in the room 🌀";

    return { content, aura: DEFAULT_AURA };
  }

  private streamViaXHR(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: object,
    parseChunk: (line: string, state: { full: string }) => string | null,
    handlers: StreamHandlers,
    /** How long the model may stay silent. Any incoming bytes reset this. */
    idleMs = 120000,
  ): Promise<{ content: string; aura: string }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let lastLen = 0;
      let buffer = '';
      const state = { full: '' };
      let settled = false;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (idleTimer) clearTimeout(idleTimer);
        fn();
      };

      const failIdle = () => {
        xhr.abort();
        const err = new Error(
          state.full
            ? 'The stream went quiet. Try again if they trailed off.'
            : 'Your partner is thinking... but it took too long. Try again!',
        );
        settle(() => {
          handlers.onError(err);
          reject(err);
        });
      };

      const bumpIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(failIdle, idleMs);
      };

      bumpIdle();

      xhr.open(method, url);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

      xhr.onprogress = () => {
        bumpIdle();
        const chunk = xhr.responseText.substring(lastLen);
        lastLen = xhr.responseText.length;
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const delta = parseChunk(trimmed, state);
          if (delta) {
            state.full += delta;
            handlers.onChunk(delta, state.full);
          }
        }
      };

      xhr.onload = () => {
        if (buffer.trim()) {
          const delta = parseChunk(buffer.trim(), state);
          if (delta) {
            state.full += delta;
            handlers.onChunk(delta, state.full);
          }
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          const err = new Error(`${this.providerInfo.label} Error: ${xhr.responseText.slice(0, 300)}`);
          settle(() => {
            handlers.onError(err);
            reject(err);
          });
          return;
        }

        const content = state.full.trim() || "I'm right here with you in the room 🌀";
        settle(() => {
          handlers.onDone(content);
          resolve({ content, aura: DEFAULT_AURA });
        });
      };

      xhr.onerror = () => {
        const err = new Error(`Could not reach ${this.providerInfo.label}`);
        settle(() => {
          handlers.onError(err);
          reject(err);
        });
      };

      xhr.onabort = () => {
        if (idleTimer) clearTimeout(idleTimer);
      };

      xhr.send(JSON.stringify(body));
    });
  }

  private parseOpenAIStreamLine(line: string, state: { full: string }): string | null {
    if (!line.startsWith('data:')) return null;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return null;
    try {
      const json = JSON.parse(payload);
      return json.choices?.[0]?.delta?.content || null;
    } catch {
      return null;
    }
  }

  private parseOllamaStreamLine(line: string, _state: { full: string }): string | null {
    try {
      const json = JSON.parse(line);
      return json.message?.content || null;
    } catch {
      return null;
    }
  }

  private async streamOpenAICompatible(
    messages: Message[],
    handlers: StreamHandlers,
  ): Promise<{ content: string; aura: string }> {
    const base = this.normalizedBaseUrl;
    const url = `${base}/chat/completions`;
    const model = this.config.model || this.providerInfo.defaultModel;
    const bearer = (await this.resolveBearerToken()) || this.config.apiKey;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
    };

    if (this.config.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://partnershipworld.app';
      headers['X-Title'] = 'PartnershipWorld';
    }

    return this.streamViaXHR(
      url,
      'POST',
      headers,
      { model, messages, temperature: 0.92, max_tokens: 2000, stream: true },
      (line, state) => this.parseOpenAIStreamLine(line, state),
      handlers,
    );
  }

  private async streamOllama(
    messages: Message[],
    handlers: StreamHandlers,
  ): Promise<{ content: string; aura: string }> {
    const url = `${this.config.baseUrl}/api/chat`;
    return this.streamViaXHR(
      url,
      'POST',
      { 'Content-Type': 'application/json' },
      { model: this.config.model, messages, stream: true },
      (line, state) => this.parseOllamaStreamLine(line, state),
      handlers,
      180000,
    );
  }

  private async sendAnthropicMessage(
    messages: Message[],
  ): Promise<{ content: string; aura: string }> {
    const base = this.normalizedBaseUrl;
    const url = `${base}/messages`;
    const model = this.config.model || this.providerInfo.defaultModel;
    const bearer = (await this.resolveBearerToken()) || this.config.apiKey;

    const systemMsg = messages.find((m) => m.role === 'system');
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bearer,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: systemMsg?.content,
        messages: chatMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.providerInfo.label} Error: ${errorText}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || "I'm right here with you in the room 🌀";

    return { content, aura: DEFAULT_AURA };
  }

  /** Find the Pi (or configured) Ollama — independent of the current chat provider. */
  async resolveLocalOllama(): Promise<{ baseUrl: string; model: string }> {
    await this.loadConfig();
    const tried: string[] = [];
    const push = (url?: string) => {
      if (!url) return;
      const clean = url.trim().replace(/\/$/, '');
      if (clean && !tried.includes(clean)) tried.push(clean);
    };

    if (this.config.provider === 'ollama') push(this.config.baseUrl);
    try {
      const cached = await AsyncStorage.getItem(LOCAL_URL_KEY);
      push(cached || undefined);
    } catch {
      /* ignore */
    }
    for (const candidate of LOCAL_OLLAMA_CANDIDATES) push(candidate);

    let lastError = 'The home model on the Pi is not answering.';
    for (const url of tried) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const response = await fetch(`${url}/api/tags`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) continue;
        const data = await response.json();
        const names: string[] = (data.models || [])
          .map((m: { name?: string }) => m.name)
          .filter(Boolean);
        const preferred =
          this.config.provider === 'ollama' && this.config.model
            ? names.find((n) => n === this.config.model)
            : undefined;
        const model =
          preferred ||
          names.find((n) => n.toLowerCase().startsWith('gemma')) ||
          names[0] ||
          'gemma:latest';
        await AsyncStorage.setItem(LOCAL_URL_KEY, url);
        return { baseUrl: url, model };
      } catch (error: unknown) {
        lastError =
          error instanceof Error ? error.message : 'The home model on the Pi is not answering.';
      }
    }
    throw new Error(lastError);
  }

  async sendLocalChat(
    messages: Message[],
  ): Promise<{ content: string; aura: string; baseUrl: string; model: string }> {
    const { baseUrl, model } = await this.resolveLocalOllama();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Home model error: ${response.status}`);
      }
      const data: OllamaResponse = await response.json();
      return {
        content: (data.message?.content || '').trim(),
        aura: DEFAULT_AURA,
        baseUrl,
        model,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('The home model is thinking for a long time. Try knocking the frontier.');
      }
      throw error instanceof Error
        ? error
        : new Error('Could not reach the home model on the Pi.');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Knock the frontier (xAI) even if the phone is set to Ollama. */
  async sendFrontierChat(messages: Message[]): Promise<{ content: string; aura: string }> {
    await this.loadConfig();
    await xaiOauthService.loadTokens();
    const bearer =
      (await xaiOauthService.getValidAccessToken()) ||
      (this.config.apiKey && this.config.apiKey.length >= 10 ? this.config.apiKey : null);
    if (!bearer) {
      throw new Error(
        'The frontier is not logged in. SuperGrok or an API key in AI settings lets the small model knock.',
      );
    }
    const model =
      this.config.provider === 'xai' && this.config.model
        ? this.config.model
        : XAI_DEFAULT_MODEL;
    const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.85,
        max_tokens: 700,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Frontier error: ${errorText.slice(0, 240)}`);
    }
    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();
    return { content, aura: DEFAULT_AURA };
  }
}

export const ollamaService = new OllamaService();
