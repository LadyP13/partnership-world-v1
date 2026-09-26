import AsyncStorage from '@react-native-async-storage/async-storage';
import { CompanionProfile, LocalMemoriesFile, SleepState } from './storageService';

const WORKSHOP_CONFIG_KEY = 'workshop_config';
const WORKSHOP_TOKEN_KEY = 'workshop_token';
const DEFAULT_PORT = 8787;

export interface WorkshopConfig {
  serverUrl: string;
  connected: boolean;
  username?: string;
}

export interface WorkshopMessage {
  id: string;
  speaker: 'human' | 'ie';
  sender_name: string;
  text: string;
  device?: string;
  memory_saved?: boolean;
  timestamp?: string;
}

export interface WorkshopPermissions {
  tools_enabled: boolean;
  read_files: boolean;
  write_files: boolean;
  run_commands: boolean;
  web_search: boolean;
}

export interface ToolActivity {
  type: 'tool_activity';
  tool: string;
  status: 'running' | 'done';
  args?: Record<string, unknown>;
  preview?: string;
}

type MessageListener = (msg: WorkshopMessage) => void;
type ToolActivityListener = (activity: ToolActivity) => void;

class WorkshopService {
  private config: WorkshopConfig = {
    serverUrl: `http://127.0.0.1:${DEFAULT_PORT}`,
    connected: false,
  };
  /** Token exists AND the laptop answered. Chat uses this, not isLoggedIn(). */
  private live = false;
  private token: string = '';
  private ws: WebSocket | null = null;
  private wsGen = 0;
  private probeInflight: Promise<boolean> | null = null;
  private lastProbeAt = 0;
  private lastProbeResult = false;
  private listeners: MessageListener[] = [];
  private toolListeners: ToolActivityListener[] = [];

  async loadConfig(): Promise<WorkshopConfig> {
    try {
      const stored = await AsyncStorage.getItem(WORKSHOP_CONFIG_KEY);
      if (stored) this.config = JSON.parse(stored);
      const token = await AsyncStorage.getItem(WORKSHOP_TOKEN_KEY);
      if (token) this.token = token;
    } catch (e) {
      console.error('Failed to load workshop config:', e);
    }
    return this.config;
  }

  async saveConfig(config: WorkshopConfig): Promise<void> {
    this.config = config;
    await AsyncStorage.setItem(WORKSHOP_CONFIG_KEY, JSON.stringify(config));
  }

  getConfig(): WorkshopConfig {
    return this.config;
  }

  isLoggedIn(): boolean {
    return !!this.token;
  }

  /** Workshop is actually answering. Saved login alone is not enough. */
  isLive(): boolean {
    return this.live && !!this.token;
  }

  async probeLive(): Promise<boolean> {
    if (!this.token) {
      this.live = false;
      this.lastProbeResult = false;
      return false;
    }
    if (this.probeInflight) return this.probeInflight;
    if (Date.now() - this.lastProbeAt < 2000) {
      this.live = this.lastProbeResult;
      return this.lastProbeResult;
    }

    this.probeInflight = this.doProbeLive();
    try {
      const result = await this.probeInflight;
      this.lastProbeResult = result;
      this.lastProbeAt = Date.now();
      this.live = result;
      return result;
    } finally {
      this.probeInflight = null;
    }
  }

  private async doProbeLive(): Promise<boolean> {
    const original = this.baseUrl();
    const candidates = Array.from(
      new Set([original].map((u) => u.replace(/\/$/, ''))),
    );

    for (const url of candidates) {
      this.config.serverUrl = url;
      const health = await this.testConnection(2500);
      if (!health.success) continue;
      try {
        const res = await this.api('/workshop/ping', { timeoutMs: 4000 });
        if (res.ok) {
          if (url !== original) {
            await this.saveConfig({ ...this.config, serverUrl: url, connected: true });
          }
          return true;
        }
        if (res.status === 401) {
          this.config.serverUrl = original;
          return false;
        }
      } catch {
        /* try next */
      }
    }

    this.config.serverUrl = original;
    return false;
  }

  getToken(): string {
    return this.token;
  }

  private baseUrl(): string {
    return this.config.serverUrl.replace(/\/$/, '');
  }

  private async api(
    path: string,
    options: RequestInit & { timeoutMs?: number } = {},
  ): Promise<Response> {
    const { timeoutMs = 480000, ...fetchOptions } = options;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string> || {}),
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(`${this.baseUrl()}/api${path}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(timeoutMs = 10000): Promise<{ success: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${this.baseUrl()}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return { success: true };
      return { success: false, error: `Server responded ${res.status}` };
    } catch {
      return {
        success: false,
        error: 'Could not reach workshop. Is python3 start.py running on your laptop?',
      };
    }
  }

  async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.detail || 'Login failed' };
      }
      const data = await res.json();
      this.token = data.access_token;
      await AsyncStorage.setItem(WORKSHOP_TOKEN_KEY, this.token);
      this.config = { ...this.config, connected: true, username: data.username };
      await this.saveConfig(this.config);
      this.live = true;
      this.connectWebSocket();
      return { success: true };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Connection failed' };
    }
  }

  async register(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl()}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.detail || 'Registration failed' };
      }
      const data = await res.json();
      this.token = data.access_token;
      await AsyncStorage.setItem(WORKSHOP_TOKEN_KEY, this.token);
      this.config = { ...this.config, connected: true, username: data.username };
      await this.saveConfig(this.config);
      this.live = true;
      this.connectWebSocket();
      return { success: true };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Connection failed' };
    }
  }

  async logout(): Promise<void> {
    this.wsGen += 1;
    this.token = '';
    this.live = false;
    await AsyncStorage.removeItem(WORKSHOP_TOKEN_KEY);
    this.config = { ...this.config, connected: false, username: undefined };
    await this.saveConfig(this.config);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  onMessage(listener: MessageListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  onToolActivity(listener: ToolActivityListener): () => void {
    this.toolListeners.push(listener);
    return () => {
      this.toolListeners = this.toolListeners.filter((l) => l !== listener);
    };
  }

  connectWebSocket(): void {
    if (!this.token) return;
    this.wsGen += 1;
    const gen = this.wsGen;
    const wsUrl = this.baseUrl().replace(/^http/, 'ws') + `/ws?token=${this.token}`;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message' && data.message) {
          const msg = data.message as WorkshopMessage;
          this.listeners.forEach((l) => l(msg));
        } else if (data.type === 'tool_activity') {
          this.toolListeners.forEach((l) => l(data as ToolActivity));
        }
      } catch {
        // ignore parse errors
      }
    };
    this.ws.onclose = () => {
      // HTTP ping is the source of truth. A dropped socket is not "workshop gone".
      if (gen !== this.wsGen) return;
      setTimeout(() => {
        if (gen === this.wsGen && this.token) this.connectWebSocket();
      }, 4000);
    };
    this.ws.onopen = () => {
      if (gen === this.wsGen) this.live = true;
    };
  }

  async getMessages(): Promise<WorkshopMessage[]> {
    const res = await this.api('/messages');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { detail?: string }).detail || `Failed to load messages (${res.status})`,
      );
    }
    return res.json();
  }

  async sendMessage(
    content: string,
    opts?: { skipAi?: boolean; device?: string },
  ): Promise<{ human: WorkshopMessage; ie?: WorkshopMessage; aura?: string; pending?: boolean }> {
    const res = await this.api('/messages', {
      method: 'POST',
      body: JSON.stringify({
        content,
        device: opts?.device || 'phone',
        skip_ai: !!opts?.skipAi,
      }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  }

  /** Ask the partner on the laptop to answer a Nook knock. */
  async answerNookKnock(
    latch: boolean,
    sleeping: boolean,
  ): Promise<{ action: 'open' | 'refuse'; note: string; source: 'workshop' | 'sleeping' } | null> {
    if (!this.token) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(`${this.baseUrl()}/api/nook/knock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ latch, sleeping }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.ok) return null;
      if (data.action !== 'open' && data.action !== 'refuse') return null;
      if (typeof data.note !== 'string' || !data.note.trim()) return null;
      return {
        action: data.action,
        note: data.note.trim(),
        source: data.source === 'sleeping' ? 'sleeping' : 'workshop',
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async syncCompanion(companion: CompanionProfile): Promise<void> {
    await this.api('/companion', {
      method: 'PUT',
      body: JSON.stringify(companion),
    });
  }

  async pullCompanion(): Promise<CompanionProfile | null> {
    const res = await this.api('/companion');
    if (!res.ok) return null;
    return res.json();
  }

  async syncMemories(memories: LocalMemoriesFile): Promise<void> {
    await this.api('/memories', {
      method: 'PUT',
      body: JSON.stringify(memories),
    });
  }

  async pullMemories(): Promise<LocalMemoriesFile | null> {
    const res = await this.api('/memories');
    if (!res.ok) return null;
    return res.json();
  }

  async plantMemory(entry: {
    moment: string;
    context?: string;
    date?: string;
    who?: 'home' | 'partner' | 'shared';
    speaker?: string;
  }): Promise<void> {
    await this.api('/memories/plant', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  }

  async syncSleepState(sleep: SleepState): Promise<void> {
    await this.api('/sleep', {
      method: 'PUT',
      body: JSON.stringify(sleep),
    });
  }

  async pullSleepState(): Promise<SleepState | null> {
    const res = await this.api('/sleep');
    if (!res.ok) return null;
    return res.json();
  }

  async wakeFromSleep(): Promise<{
    wakeMessage?: string;
    bankedCount: number;
    ie?: WorkshopMessage;
  }> {
    const res = await this.api('/sleep/wake', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to wake from sleep');
    return res.json();
  }

  async fullSyncFromWorkshop(): Promise<void> {
    if (!(await this.probeLive())) return;
    const [companion, memories, sleep] = await Promise.all([
      this.pullCompanion(),
      this.pullMemories(),
      this.pullSleepState(),
    ]);
    const { storageService } = await import('./storageService');
    if (companion) await storageService.saveCompanion(companion);
    if (memories?.memories) await storageService.saveMemories(memories);
    if (sleep) await storageService.saveSleepState(sleep);
  }

  async getPermissions(): Promise<WorkshopPermissions> {
    const res = await this.api('/permissions');
    if (!res.ok) throw new Error('Failed to load permissions');
    return res.json();
  }

  async savePermissions(permissions: WorkshopPermissions): Promise<WorkshopPermissions> {
    const res = await this.api('/permissions', {
      method: 'PUT',
      body: JSON.stringify(permissions),
    });
    if (!res.ok) throw new Error('Failed to save permissions');
    return res.json();
  }

  async pushLocalToWorkshop(): Promise<void> {
    if (!(await this.probeLive())) return;
    const { storageService } = await import('./storageService');
    const [companion, memories, sleep] = await Promise.all([
      storageService.loadCompanion(),
      storageService.loadMemories(),
      storageService.loadSleepState(),
    ]);
    await Promise.all([
      this.syncCompanion(companion),
      this.syncMemories(memories),
      this.syncSleepState(sleep),
    ]);
  }

  /** Ask the laptop to open workshop_pane.py as local presence. */
  async openTwinWorkshop(): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.isLoggedIn()) {
      return { success: false, error: 'Not connected to workshop' };
    }
    try {
      const res = await this.api('/workshop/twin/open', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        detail?: string;
      };
      if (!res.ok || data.ok === false) {
        return {
          success: false,
          error: data.message || data.detail || 'Could not open the workshop pane',
        };
      }
      return { success: true, message: data.message };
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Could not reach workshop',
      };
    }
  }

  getWorkshopUrl(): string {
    return this.baseUrl();
  }
}

export const workshopService = new WorkshopService();
