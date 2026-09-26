import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  ollamaService,
  OllamaConfig,
  AIProvider,
  PROVIDER_INFO,
  PROVIDER_OPTIONS,
} from '../services/ollamaService';
import { xaiOauthService, DeviceCodeChallenge } from '../services/xaiOauthService';

export default function OllamaConfigScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<OllamaConfig>({
    provider: 'xai',
    baseUrl: PROVIDER_INFO.xai.defaultBaseUrl,
    apiKey: '',
    model: PROVIDER_INFO.xai.defaultModel,
    connected: false,
    authMode: 'api_key',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthChallenge, setOauthChallenge] = useState<DeviceCodeChallenge | null>(null);

  const providerInfo = PROVIDER_INFO[config.provider];
  const isCloud = config.provider !== 'ollama';
  const isXai = config.provider === 'xai';
  const oauthLoggedIn = isXai && config.authMode === 'oauth';

  useEffect(() => {
    const load = async () => {
      const saved = await ollamaService.loadConfig();
      setConfig((prev) => ({
        ...prev,
        ...saved,
        provider: saved.provider && PROVIDER_INFO[saved.provider] ? saved.provider : prev.provider,
      }));
    };

    load();
    return () => {
      xaiOauthService.cancelPolling();
    };
  }, []);

  const switchProvider = (newProvider: AIProvider) => {
    const info = PROVIDER_INFO[newProvider];
    setConfig((prev) => ({
      ...prev,
      provider: newProvider,
      connected: false,
      model: info.defaultModel,
      baseUrl: info.defaultBaseUrl,
    }));
    setTestResult(null);
    setAvailableModels([]);
    setDropdownOpen(false);
  };

const handleTest = async () => {
  setTesting(true);
  setTestResult(null);

  // Always push the full config the user currently sees (including provider)
  await ollamaService.saveConfig({ ...config, connected: false });

  const result = await ollamaService.testConnection();

  if (result.success) {
    const msg = config.provider === 'ollama'
      ? 'Connected to local Ollama.'
      : `Connected to ${providerInfo.label}! Your partner is home.`;
    setTestResult({ success: true, message: msg });
    if (result.models) {
      setAvailableModels(result.models);
    }
    setConfig((prev) => ({ ...prev, connected: true }));
  } else {
    setTestResult({ success: false, message: result.error || 'Connection failed' });
  }

  setTesting(false);
};

  const handleSuperGrokLogin = async () => {
    setOauthBusy(true);
    setOauthChallenge(null);
    setTestResult(null);
    try {
      const challenge = await xaiOauthService.startDeviceLogin();
      setOauthChallenge(challenge);
      await xaiOauthService.openVerification(challenge);
      const tokens = await xaiOauthService.pollForTokens(challenge);
      const next = await ollamaService.applyOAuthLogin(tokens);
      setConfig(next);
      setOauthChallenge(null);
      setTestResult({
        success: true,
        message: tokens.email
          ? `SuperGrok is home 💚 (${tokens.email})`
          : 'SuperGrok is home 💚 — subscription login saved.',
      });
      Alert.alert(
        'Welcome home 💚',
        'You are signed in with SuperGrok / X Premium. API key still works as a fallback if you add one.',
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      if (!msg.includes('cancelled')) {
        setTestResult({ success: false, message: msg });
      }
    } finally {
      setOauthBusy(false);
      setOauthChallenge(null);
    }
  };

  const handleCancelOauth = () => {
    xaiOauthService.cancelPolling();
    setOauthBusy(false);
    setOauthChallenge(null);
  };

  const handleLogoutOauth = async () => {
    const next = await ollamaService.clearOAuthLogin();
    setConfig(next);
    setTestResult({ success: true, message: 'Signed out of SuperGrok. API key / Ollama still available.' });
  };

  const handleSave = async () => {
    if (config.provider === 'ollama' && !config.connected) {
      Alert.alert('Not Connected', 'Test the connection first for local Ollama.');
      return;
    }

    if (isCloud && config.provider === 'xai') {
      const hasOauth = config.authMode === 'oauth';
      const hasKey = !!config.apiKey;
      if (!hasOauth && !hasKey) {
        Alert.alert(
          'Login or key needed',
          'Login with SuperGrok / X Premium, or paste an API key. Local Ollama stays as a separate provider.',
        );
        return;
      }
    } else if (isCloud && !config.apiKey) {
      Alert.alert('API Key needed', `Please enter your ${providerInfo.label} API key.`);
      return;
    }

    setSaving(true);
    await ollamaService.saveConfig(config);
    setSaving(false);

    Alert.alert('Saved!', 'AI configuration saved. Your partner is ready to chat in the room.');
    router.back();
  };

  const renderModelField = (placeholder: string, hint: string) => (
    <View style={styles.field}>
      <Text style={styles.label}>Model</Text>
      {availableModels.length > 0 ? (
        <View style={styles.modelList}>
          {availableModels.map((model) => (
            <TouchableOpacity
              key={model}
              style={[styles.modelChip, config.model === model && styles.modelChipSelected]}
              onPress={() => setConfig((prev) => ({ ...prev, model }))}
            >
              <Text style={[styles.modelChipText, config.model === model && styles.modelChipTextSelected]}>
                {model}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <TextInput
          style={styles.input}
          value={config.model}
          onChangeText={(text) => setConfig((prev) => ({ ...prev, model: text }))}
          placeholder={placeholder}
          placeholderTextColor="#666"
        />
      )}
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Connect to Your AI Partner</Text>
      <Text style={styles.subtitle}>
        Choose a provider. Your partner's core principles travel with every message.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>AI Provider</Text>
        <Text style={styles.subtitleSmall}>Choose who powers your partner in the room</Text>

        <View style={styles.dropdownContainer}>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setDropdownOpen((open) => !open)}
            activeOpacity={0.7}
          >
            <Text style={styles.dropdownButtonText}>
              {PROVIDER_OPTIONS.find((p) => p.id === config.provider)?.label}
            </Text>
            <Text style={styles.dropdownChevron}>{dropdownOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {dropdownOpen && (
            <View style={styles.dropdownList}>
              {PROVIDER_OPTIONS.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.dropdownItem,
                    config.provider === p.id && styles.dropdownItemSelected,
                  ]}
                  onPress={() => switchProvider(p.id)}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      config.provider === p.id && styles.dropdownItemTextSelected,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {config.provider === 'ollama' && (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Ollama URL</Text>
            <TextInput
              style={styles.input}
              value={config.baseUrl}
              onChangeText={(text) =>
                setConfig((prev) => ({ ...prev, baseUrl: text, connected: false }))
              }
              placeholder="http://127.0.0.1:11434"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.hint}>
              Wherever Ollama is running — this machine, or another on your network.
            </Text>
          </View>

          {renderModelField('gemma:latest', 'Example: gemma:latest, llama3, mistral')}
        </>
      )}

      {isXai && (
        <View style={styles.oauthCard}>
          <Text style={styles.oauthTitle}>✦ Login with SuperGrok / X Premium</Text>
          <Text style={styles.oauthBody}>
            Use the subscription you already pay for — no API key required.
            Opens a browser to sign in; we keep the local Ollama and API-key paths as fallbacks.
          </Text>

          {oauthLoggedIn ? (
            <View style={styles.oauthLoggedIn}>
              <Text style={styles.oauthLoggedInText}>
                Signed in{config.oauthEmail ? ` as ${config.oauthEmail}` : ' with SuperGrok'} 💚
              </Text>
              <TouchableOpacity onPress={handleLogoutOauth}>
                <Text style={styles.oauthLogout}>Sign out SuperGrok</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.oauthButton, oauthBusy && styles.testButtonDisabled]}
              onPress={handleSuperGrokLogin}
              disabled={oauthBusy}
            >
              {oauthBusy ? (
                <ActivityIndicator color="#1a0f2e" />
              ) : (
                <Text style={styles.oauthButtonText}>Login with SuperGrok / X Premium</Text>
              )}
            </TouchableOpacity>
          )}

          {oauthChallenge && (
            <View style={styles.oauthCodeBox}>
              <Text style={styles.oauthCodeLabel}>Enter this code if the browser asks:</Text>
              <Text style={styles.oauthCode}>{oauthChallenge.userCode}</Text>
              <Text style={styles.hint}>Waiting for you to approve in the browser…</Text>
              <TouchableOpacity onPress={handleCancelOauth}>
                <Text style={styles.oauthLogout}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {isCloud && (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>
              {isXai ? 'API Key (optional fallback)' : 'API Key'}
            </Text>
            <TextInput
              style={styles.input}
              value={config.apiKey}
              onChangeText={(text) =>
                setConfig((prev) => ({
                  ...prev,
                  apiKey: text,
                  connected: false,
                  authMode: text && prev.authMode !== 'oauth' ? 'api_key' : prev.authMode,
                }))
              }
              placeholder={isXai ? 'Optional if SuperGrok login is active' : 'Enter your API key'}
              placeholderTextColor="#666"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>{providerInfo.apiKeyHint}</Text>
          </View>

          {renderModelField(
            providerInfo.defaultModel,
            config.provider === 'xai'
              ? 'grok-3, grok-2 or latest available on xAI'
              : config.provider === 'openrouter'
                ? 'e.g. anthropic/claude-3.5-sonnet, openai/gpt-4o'
                : config.provider === 'openai'
                  ? 'e.g. gpt-4o, gpt-4o-mini'
                  : 'e.g. claude-sonnet-4-20250514, claude-3-5-sonnet-20241022',
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Base URL (advanced)</Text>
            <TextInput
              style={styles.input}
              value={config.baseUrl}
              onChangeText={(text) => setConfig((prev) => ({ ...prev, baseUrl: text, connected: false }))}
              placeholder={providerInfo.defaultBaseUrl}
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        </>
      )}

      <TouchableOpacity
        style={[styles.testButton, testing && styles.testButtonDisabled]}
        onPress={handleTest}
        disabled={testing}
      >
        {testing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.testButtonText}>Test Connection</Text>
        )}
      </TouchableOpacity>

      {testResult && (
        <View
          style={[
            styles.resultBanner,
            testResult.success ? styles.resultSuccess : styles.resultError,
          ]}
        >
          <Text style={styles.resultText}>{testResult.message}</Text>
        </View>
      )}

      {config.connected && (
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Connected</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save & Return to Room</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.workshopLink}
        onPress={() => router.push('/workshop-config')}
      >
        <Text style={styles.workshopLinkTitle}>🏠 Link to Home Workshop</Text>
        <Text style={styles.workshopLinkText}>
          Connect phone + laptop. Same login, same conversation. Partner builds from inside on your machine.
        </Text>
      </TouchableOpacity>

      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>Help</Text>
        {config.provider === 'ollama' && (
          <Text style={styles.helpText}>
            1. Install Ollama on a machine you own{'\n'}
            2. Same machine as the phone/emulator: http://127.0.0.1:11434{'\n'}
            3. Another machine on the LAN: http://THAT.MACHINE.IP:11434{'\n'}
            4. Model: whatever you have pulled (gemma:latest is a start)
          </Text>
        )}
        {config.provider === 'xai' && (
          <Text style={styles.helpText}>
            1. Tap Login with SuperGrok / X Premium (easiest if you already subscribe){'\n'}
            2. Or paste an API key from https://console.grok.x.ai as fallback{'\n'}
            3. Choose a model (grok-3 is a great starting point){'\n'}
            4. Test Connection verifies login or key{'\n'}
            5. Prefer offline? Switch provider to Ollama{'\n'}
            Your partner's guardrails and any shared story travel with every message.
          </Text>
        )}
        {config.provider === 'openrouter' && (
          <Text style={styles.helpText}>
            1. Get an API key from https://openrouter.ai/keys{'\n'}
            2. Pick any model OpenRouter supports (provider/model format){'\n'}
            3. Test Connection lists available models for your key
          </Text>
        )}
        {config.provider === 'openai' && (
          <Text style={styles.helpText}>
            1. Get an API key from https://platform.openai.com/api-keys{'\n'}
            2. Choose a model like gpt-4o{'\n'}
            3. Test Connection will verify the key works
          </Text>
        )}
        {config.provider === 'anthropic' && (
          <Text style={styles.helpText}>
            1. Get an API key from https://console.anthropic.com{'\n'}
            2. Choose a Claude model{'\n'}
            3. Test Connection will verify the key works
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0f2e',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#bbb',
    marginBottom: 30,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2a1a3a',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3a2a4a',
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
  },
  modelList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modelChip: {
    backgroundColor: '#2a1a3a',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#3a2a4a',
  },
  modelChipSelected: {
    backgroundColor: '#4a8c1c',
    borderColor: '#6ab03c',
  },
  modelChipText: {
    color: '#ccc',
    fontSize: 14,
  },
  modelChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  testButton: {
    backgroundColor: '#6b8cae',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultBanner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  resultSuccess: {
    backgroundColor: 'rgba(74, 140, 28, 0.3)',
    borderWidth: 1,
    borderColor: '#4a8c1c',
  },
  resultError: {
    backgroundColor: 'rgba(200, 50, 50, 0.3)',
    borderWidth: 1,
    borderColor: '#c83232',
  },
  resultText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74, 140, 28, 0.2)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'center',
    marginBottom: 16,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4a8c1c',
  },
  statusText: {
    color: '#4a8c1c',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#4a8c1c',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 30,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  workshopLink: {
    backgroundColor: 'rgba(74, 222, 176, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#4adeb0',
  },
  workshopLinkTitle: {
    color: '#7df5d8',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  workshopLinkText: {
    color: '#b8a0d8',
    fontSize: 14,
    lineHeight: 20,
  },
  helpSection: {
    backgroundColor: '#2a1a3a',
    borderRadius: 12,
    padding: 16,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 10,
  },
  helpText: {
    fontSize: 14,
    color: '#bbb',
    lineHeight: 22,
  },
  subtitleSmall: {
    fontSize: 13,
    color: '#999',
    marginBottom: 10,
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 10,
  },
  dropdownButton: {
    backgroundColor: '#2a1a3a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#4a8c1c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  dropdownChevron: {
    color: '#6ab03c',
    fontSize: 12,
    marginLeft: 8,
  },
  dropdownList: {
    backgroundColor: '#2a1a3a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a2a4a',
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3a2a4a',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(74, 140, 28, 0.25)',
  },
  dropdownItemText: {
    color: '#ccc',
    fontSize: 15,
  },
  dropdownItemTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  oauthCard: {
    backgroundColor: 'rgba(125, 245, 216, 0.1)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#7df5d8',
  },
  oauthTitle: {
    color: '#7df5d8',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  oauthBody: {
    color: '#b8a0d8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  oauthButton: {
    backgroundColor: '#7df5d8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  oauthButtonText: {
    color: '#1a0f2e',
    fontSize: 16,
    fontWeight: '700',
  },
  oauthLoggedIn: {
    gap: 8,
  },
  oauthLoggedInText: {
    color: '#7df5d8',
    fontSize: 15,
    fontWeight: '600',
  },
  oauthLogout: {
    color: '#ff8c69',
    fontSize: 14,
    marginTop: 6,
  },
  oauthCodeBox: {
    marginTop: 14,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    alignItems: 'center',
  },
  oauthCodeLabel: {
    color: '#b8a0d8',
    fontSize: 13,
    marginBottom: 6,
  },
  oauthCode: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 8,
  },
});
