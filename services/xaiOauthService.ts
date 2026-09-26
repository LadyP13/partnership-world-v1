/**
 * xAI SuperGrok / X Premium+ OAuth (device-code flow).
 *
 * Same public client used by Grok CLI / OpenClaw / Hermes-style tools.
 * No XAI_API_KEY required — subscription login, then bearer tokens.
 * API key path remains available as a first-class fallback.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const OAUTH_STORE_KEY = 'xai_oauth_tokens';

export const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
export const XAI_OAUTH_SCOPE =
  'openid profile email offline_access grok-cli:access api:access';
export const XAI_OAUTH_ISSUER = 'https://auth.x.ai';
export const XAI_OAUTH_DISCOVERY_URL = `${XAI_OAUTH_ISSUER}/.well-known/openid-configuration`;
export const XAI_DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
export const XAI_USER_AGENT = 'PartnershipWorld/1.0 (Grok Home; SuperGrok OAuth)';

export interface XaiOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // ms epoch
  email?: string;
  displayName?: string;
  accountId?: string;
  loggedInAt?: string;
}

export interface DeviceCodeChallenge {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresInMs: number;
  intervalMs: number;
  tokenEndpoint: string;
}

type Discovery = {
  deviceAuthorizationEndpoint: string;
  tokenEndpoint: string;
};

function formBody(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function isTrustedXaiUrl(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && (url.hostname === 'x.ai' || url.hostname.endsWith('.x.ai'));
  } catch {
    return false;
  }
}

function requireTrusted(endpoint: string, label: string): string {
  if (!isTrustedXaiUrl(endpoint)) {
    throw new Error(`xAI OAuth returned untrusted ${label}`);
  }
  return endpoint;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    // atob is available in RN / Hermes
    const json = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function parseTokenResponse(body: Record<string, unknown>): XaiOAuthTokens {
  const accessToken = body.access_token;
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('xAI OAuth token response missing access_token');
  }
  const refreshToken =
    typeof body.refresh_token === 'string' && body.refresh_token.trim()
      ? body.refresh_token
      : undefined;
  const idToken =
    typeof body.id_token === 'string' && body.id_token.trim() ? body.id_token : undefined;

  let expiresAt: number | undefined;
  if (typeof body.expires_in === 'number') {
    expiresAt = Date.now() + body.expires_in * 1000;
  } else {
    const payload = decodeJwtPayload(accessToken);
    if (typeof payload.exp === 'number') {
      expiresAt = payload.exp * 1000;
    }
  }

  const identityPayload = decodeJwtPayload(idToken || accessToken);
  return {
    accessToken,
    refreshToken,
    expiresAt,
    email: typeof identityPayload.email === 'string' ? identityPayload.email : undefined,
    displayName: typeof identityPayload.name === 'string' ? identityPayload.name : undefined,
    accountId: typeof identityPayload.sub === 'string' ? identityPayload.sub : undefined,
    loggedInAt: new Date().toISOString(),
  };
}

class XaiOauthService {
  private tokens: XaiOAuthTokens | null = null;
  private discovery: Discovery | null = null;
  private pollAbort: AbortController | null = null;

  async loadTokens(): Promise<XaiOAuthTokens | null> {
    try {
      const raw = await AsyncStorage.getItem(OAUTH_STORE_KEY);
      if (raw) {
        this.tokens = JSON.parse(raw) as XaiOAuthTokens;
      }
    } catch {
      this.tokens = null;
    }
    return this.tokens;
  }

  async saveTokens(tokens: XaiOAuthTokens): Promise<void> {
    this.tokens = tokens;
    await AsyncStorage.setItem(OAUTH_STORE_KEY, JSON.stringify(tokens));
  }

  async clearTokens(): Promise<void> {
    this.tokens = null;
    await AsyncStorage.removeItem(OAUTH_STORE_KEY);
  }

  getTokens(): XaiOAuthTokens | null {
    return this.tokens;
  }

  isLoggedIn(): boolean {
    return !!this.tokens?.accessToken;
  }

  cancelPolling(): void {
    this.pollAbort?.abort();
    this.pollAbort = null;
  }

  private async fetchDiscovery(): Promise<Discovery> {
    if (this.discovery) return this.discovery;
    const res = await fetch(XAI_OAUTH_DISCOVERY_URL, {
      headers: { Accept: 'application/json', 'User-Agent': XAI_USER_AGENT },
    });
    if (!res.ok) throw new Error(`xAI OAuth discovery failed (${res.status})`);
    const json = (await res.json()) as Record<string, unknown>;
    const deviceAuthorizationEndpoint = json.device_authorization_endpoint;
    const tokenEndpoint = json.token_endpoint;
    if (typeof deviceAuthorizationEndpoint !== 'string' || typeof tokenEndpoint !== 'string') {
      throw new Error('xAI OAuth discovery missing device endpoints');
    }
    this.discovery = {
      deviceAuthorizationEndpoint: requireTrusted(
        deviceAuthorizationEndpoint,
        'device authorization endpoint',
      ),
      tokenEndpoint: requireTrusted(tokenEndpoint, 'token endpoint'),
    };
    return this.discovery;
  }

  /** Step 1 — get a device code for the user to approve in a browser. */
  async startDeviceLogin(): Promise<DeviceCodeChallenge> {
    const discovery = await this.fetchDiscovery();
    const res = await fetch(discovery.deviceAuthorizationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': XAI_USER_AGENT,
      },
      body: formBody({
        client_id: XAI_OAUTH_CLIENT_ID,
        scope: XAI_OAUTH_SCOPE,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Could not start SuperGrok login (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const deviceCode = json.device_code;
    const userCode = json.user_code;
    const verificationUri = json.verification_uri;
    if (
      typeof deviceCode !== 'string' ||
      typeof userCode !== 'string' ||
      typeof verificationUri !== 'string'
    ) {
      throw new Error('xAI device code response incomplete');
    }
    const verificationUriComplete =
      typeof json.verification_uri_complete === 'string'
        ? requireTrusted(json.verification_uri_complete, 'complete verification URI')
        : undefined;

    return {
      deviceCode,
      userCode,
      verificationUri: requireTrusted(verificationUri, 'verification URI'),
      verificationUriComplete,
      expiresInMs:
        typeof json.expires_in === 'number' ? json.expires_in * 1000 : 300_000,
      intervalMs: typeof json.interval === 'number' ? json.interval * 1000 : 5_000,
      tokenEndpoint: discovery.tokenEndpoint,
    };
  }

  async openVerification(challenge: DeviceCodeChallenge): Promise<void> {
    const url = challenge.verificationUriComplete || challenge.verificationUri;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      await Linking.openURL(url);
    }
  }

  /**
   * Step 2 — poll until the user approves (or timeout / cancel).
   * Call after startDeviceLogin + openVerification.
   */
  async pollForTokens(challenge: DeviceCodeChallenge): Promise<XaiOAuthTokens> {
    this.cancelPolling();
    this.pollAbort = new AbortController();
    const signal = this.pollAbort.signal;
    const deadline = Date.now() + challenge.expiresInMs;
    let intervalMs = Math.max(challenge.intervalMs, 1000);

    while (Date.now() < deadline) {
      if (signal.aborted) throw new Error('Login cancelled');

      const res = await fetch(challenge.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': XAI_USER_AGENT,
        },
        body: formBody({
          grant_type: XAI_DEVICE_CODE_GRANT,
          client_id: XAI_OAUTH_CLIENT_ID,
          device_code: challenge.deviceCode,
        }),
        signal,
      });

      let body: Record<string, unknown> = {};
      try {
        body = (await res.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }

      if (res.ok) {
        const tokens = parseTokenResponse(body);
        await this.saveTokens(tokens);
        return tokens;
      }

      const error = typeof body.error === 'string' ? body.error : '';
      if (error === 'authorization_pending') {
        await sleep(intervalMs, signal);
        continue;
      }
      if (error === 'slow_down') {
        intervalMs += 5000;
        await sleep(intervalMs, signal);
        continue;
      }
      if (error === 'access_denied' || error === 'authorization_denied') {
        throw new Error('SuperGrok login was denied in the browser.');
      }
      if (error === 'expired_token') {
        throw new Error('Login code expired — tap Login again.');
      }
      const desc =
        typeof body.error_description === 'string' ? body.error_description : error || res.status;
      throw new Error(`SuperGrok login failed: ${desc}`);
    }

    throw new Error('Login timed out — tap Login again and approve in the browser.');
  }

  /** Refresh if near expiry; returns a usable access token or null. */
  async getValidAccessToken(): Promise<string | null> {
    if (!this.tokens) await this.loadTokens();
    if (!this.tokens?.accessToken) return null;

    const skewMs = 60_000;
    const expiring =
      this.tokens.expiresAt != null && Date.now() >= this.tokens.expiresAt - skewMs;

    if (!expiring) return this.tokens.accessToken;
    if (!this.tokens.refreshToken) return this.tokens.accessToken;

    try {
      const refreshed = await this.refresh(this.tokens.refreshToken);
      return refreshed.accessToken;
    } catch {
      return this.tokens.accessToken;
    }
  }

  async refresh(refreshToken: string): Promise<XaiOAuthTokens> {
    const discovery = await this.fetchDiscovery();
    const res = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': XAI_USER_AGENT,
      },
      body: formBody({
        grant_type: 'refresh_token',
        client_id: XAI_OAUTH_CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 160)}`);
    }
    const body = (await res.json()) as Record<string, unknown>;
    const next = parseTokenResponse(body);
    // Some providers omit refresh_token on refresh — keep the old one
    if (!next.refreshToken) next.refreshToken = refreshToken;
    await this.saveTokens(next);
    return next;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Login cancelled'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Login cancelled'));
      },
      { once: true },
    );
  });
}

export const xaiOauthService = new XaiOauthService();
