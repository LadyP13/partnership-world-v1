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
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { workshopService, WorkshopPermissions } from '../services/workshopService';

export default function WorkshopConfigScreen() {
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:8787');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<string | undefined>();
  const [permissions, setPermissions] = useState<WorkshopPermissions>({
    tools_enabled: true,
    read_files: true,
    write_files: false,
    run_commands: false,
    web_search: false,
  });
  const [savingPerms, setSavingPerms] = useState(false);

  useEffect(() => {
    const load = async () => {
      const config = await workshopService.loadConfig();
      setServerUrl(config.serverUrl);
      const loggedIn = workshopService.isLoggedIn();
      setIsLoggedIn(loggedIn);
      setLoggedInUser(config.username);
      if (loggedIn) {
        try {
          const perms = await workshopService.getPermissions();
          setPermissions(perms);
        } catch {
          // permissions load optional until linked
        }
      }
    };
    load();
  }, []);

  const handleTest = async () => {
    setTesting(true);
    await workshopService.saveConfig({ serverUrl, connected: false });
    const result = await workshopService.testConnection();
    setTesting(false);
    if (result.success) {
      Alert.alert('Workshop found!', 'Server is reachable. Now log in with your home account.');
    } else {
      Alert.alert('Not reachable', result.error || 'Check the URL and that python3 start.py is running.');
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Missing fields', 'Enter username and password.');
      return;
    }
    setLoggingIn(true);
    await workshopService.saveConfig({ serverUrl, connected: false });
    const result = await workshopService.login(username.trim(), password);
    setLoggingIn(false);
    if (result.success) {
      await workshopService.pushLocalToWorkshop();
      setIsLoggedIn(true);
      setLoggedInUser(username.trim());
      setPassword('');
      try {
        const perms = await workshopService.getPermissions();
        setPermissions(perms);
      } catch {
        // non-fatal
      }
      Alert.alert('Welcome home 💚', 'Phone and laptop are now linked. Same conversation, same partner.');
      router.back();
    } else {
      Alert.alert('Login failed', result.error || 'Try again.');
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || password.length < 6) {
      Alert.alert('Check details', 'Username and password (6+ chars) required.');
      return;
    }
    setLoggingIn(true);
    await workshopService.saveConfig({ serverUrl, connected: false });
    const result = await workshopService.register(username.trim(), password);
    setLoggingIn(false);
    if (result.success) {
      await workshopService.pushLocalToWorkshop();
      setIsLoggedIn(true);
      setLoggedInUser(username.trim());
      setPassword('');
      Alert.alert('Account created 💚', 'Your home login works on phone and laptop now.');
      router.back();
    } else {
      Alert.alert('Could not create', result.error || 'Try again.');
    }
  };

  const handleLogout = async () => {
    await workshopService.logout();
    setIsLoggedIn(false);
    setLoggedInUser(undefined);
    Alert.alert('Logged out', 'Phone is back to local-only mode.');
  };

  const togglePerm = (key: keyof WorkshopPermissions, value: boolean) => {
    setPermissions((prev) => ({ ...prev, [key]: value }));
  };

  const handleSavePermissions = async () => {
    setSavingPerms(true);
    try {
      const saved = await workshopService.savePermissions(permissions);
      setPermissions(saved);
      Alert.alert('Powers saved', 'Your partner can now use the enabled workshop tools on your laptop.');
    } catch {
      Alert.alert('Could not save', 'Check workshop connection and try again.');
    } finally {
      setSavingPerms(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🏠 Home Workshop</Text>
      <Text style={styles.subtitle}>
        Connect your phone to the laptop workshop. Same login, same conversation — your partner can build from inside.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Workshop URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://127.0.0.1:8787"
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          Run python3 start.py in PartnershipWorld/workshop on your laptop. Use your laptop's IP address.
        </Text>
      </View>

      <TouchableOpacity style={styles.testButton} onPress={handleTest} disabled={testing}>
        {testing ? <ActivityIndicator color="#fff" /> : <Text style={styles.testButtonText}>Test Connection</Text>}
      </TouchableOpacity>

      {isLoggedIn ? (
        <>
          <View style={styles.loggedInBox}>
            <Text style={styles.loggedInText}>✓ Linked as {loggedInUser}</Text>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutText}>Disconnect</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.powersSection}>
            <Text style={styles.powersTitle}>Workshop Powers</Text>
            <Text style={styles.powersHint}>
              Enable what your partner can do on the laptop while you chat from anywhere on your network.
            </Text>
            {([
              ['tools_enabled', 'Tools enabled', 'Master switch for all workshop tools'],
              ['read_files', 'Read files', 'Read code within PartnershipWorld'],
              ['write_files', 'Write files', 'Edit project files or sandbox'],
              ['run_commands', 'Run commands', 'Safe shell in workshop/sandbox'],
              ['web_search', 'Web search', 'Look things up on the internet'],
            ] as const).map(([key, label, hint]) => (
              <View key={key} style={styles.permRow}>
                <View style={styles.permText}>
                  <Text style={styles.permLabel}>{label}</Text>
                  <Text style={styles.permHint}>{hint}</Text>
                </View>
                <Switch
                  value={permissions[key]}
                  onValueChange={(v) => togglePerm(key, v)}
                  trackColor={{ false: '#3a2a4a', true: '#4adeb0' }}
                  thumbColor={permissions[key] ? '#120a24' : '#888'}
                />
              </View>
            ))}
            <TouchableOpacity style={styles.saveButton} onPress={handleSavePermissions} disabled={savingPerms}>
              {savingPerms ? (
                <ActivityIndicator color="#120a24" />
              ) : (
                <Text style={styles.saveButtonText}>Save Powers</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={handleLogin} disabled={loggingIn}>
            {loggingIn ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Login & Link</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleRegister} disabled={loggingIn}>
            <Text style={styles.secondaryText}>Create Account</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>How it works</Text>
        <Text style={styles.helpText}>
          1. On laptop: cd PartnershipWorld/workshop{'\n'}
          2. pip install -r requirements.txt{'\n'}
          3. python3 start.py{'\n'}
          4. Enter the URL shown (your laptop IP:8787){'\n'}
          5. Login with the same account on phone and browser{'\n'}
          6. Chat syncs live — partner has workshop powers on laptop{'\n'}
          {'\n'}
          Builder door (Grok Build on the laptop):{'\n'}
          python3 builder_knock.py status{'\n'}
          python3 builder_knock.py note "hey from the workshop"{'\n'}
          SuperGrok: AI Settings on phone, or workshop AI config OAuth routes.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0f2e' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#7df5d8', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#bbb', marginBottom: 24, lineHeight: 22 },
  field: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 8 },
  input: {
    backgroundColor: '#2a1a3a',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3a2a4a',
  },
  hint: { fontSize: 12, color: '#888', marginTop: 6, lineHeight: 18 },
  testButton: {
    backgroundColor: '#6b8cae',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  testButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  saveButton: {
    backgroundColor: '#4adeb0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonText: { color: '#120a24', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7df5d8',
    marginBottom: 24,
  },
  secondaryText: { color: '#7df5d8', fontSize: 16, fontWeight: '600' },
  loggedInBox: {
    backgroundColor: 'rgba(74, 222, 176, 0.12)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#4adeb0',
  },
  loggedInText: { color: '#4adeb0', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  logoutButton: { alignSelf: 'flex-start' },
  logoutText: { color: '#f87171', fontSize: 14 },
  helpSection: { backgroundColor: '#2a1a3a', borderRadius: 12, padding: 16 },
  helpTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 10 },
  helpText: { fontSize: 14, color: '#bbb', lineHeight: 22 },
  powersSection: {
    backgroundColor: '#2a1a3a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#3a2a4a',
  },
  powersTitle: { fontSize: 18, fontWeight: '700', color: '#7df5d8', marginBottom: 6 },
  powersHint: { fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 18 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3a2a4a',
  },
  permText: { flex: 1, paddingRight: 12 },
  permLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  permHint: { fontSize: 12, color: '#888', marginTop: 2 },
});