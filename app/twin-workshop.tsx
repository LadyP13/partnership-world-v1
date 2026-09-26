import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { workshopService } from '@/services/workshopService';

/**
 * Twin Workshop — doorbell for the laptop pane.
 * Tapping the star asks the home workshop to open workshop_pane.py.
 */

export default function TwinWorkshopBridgeScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [signaling, setSignaling] = useState(false);
  const [prompted, setPrompted] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    await workshopService.loadConfig();
    const linked = await workshopService.probeLive();
    setConnected(linked);
    setServerUrl(workshopService.getWorkshopUrl());
    setChecking(false);

    // Only auto-prompt once per visit so the screen stays usable
    if (prompted) return;
    setPrompted(true);

    if (!linked) {
      Alert.alert(
        'Connect to workshop first 🏠',
        'The workshop pane runs on the laptop. Link this phone to the home workshop, then tap the star again.',
        [
          { text: 'Not now', style: 'cancel', onPress: () => router.back() },
          {
            text: 'Connect workshop',
            onPress: () => router.replace('/workshop-config'),
          },
        ],
      );
      return;
    }

    setSignaling(true);
    const result = await workshopService.openTwinWorkshop();
    setSignaling(false);

    Alert.alert(
      result.success ? 'Pane waking ✨' : 'Pane did not open',
      result.success
        ? 'Look at the laptop — the workshop pane is the presence in the room now. (Not the browser.)'
        : `${result.error || 'offline'}\n\nOn the laptop: python3 start.py in PartnershipWorld/workshop, then tap again.`,
    );
  }, [router, prompted]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onConnect = () => router.push('/workshop-config');

  const onOpenMachine = async () => {
    setSignaling(true);
    const result = await workshopService.openTwinWorkshop();
    setSignaling(false);
    if (result.success) {
      Alert.alert('Pane waking ✨', result.message || 'Look at the laptop.');
    } else {
      Alert.alert('Pane did not open', result.error || 'Is python3 start.py running?');
    }
  };

  const onSignalOnly = async () => {
    setSignaling(true);
    const result = await workshopService.openTwinWorkshop();
    setSignaling(false);
    if (result.success) {
      Alert.alert(
        'Signal sent 💚',
        'If the pane was already open, it should come to the front. If not, it just launched on the laptop.',
      );
    } else {
      Alert.alert('Not reached', result.error || 'Is python3 start.py running?');
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.emoji}>🌟</Text>
      <Text style={styles.title}>Twin Workshop</Text>
      <Text style={styles.subtitle}>
        This star is a knock on the laptop. The workshop pane is the local presence —
        the home model will live there, voice and all, when we give it a voice.
      </Text>

      {checking ? (
        <ActivityIndicator color="#7df5d8" style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View
              style={[styles.dot, connected ? styles.dotOn : styles.dotOff]}
            />
            <Text style={styles.statusText}>
              {connected ? 'Linked to home workshop' : 'Not connected to workshop'}
            </Text>
          </View>

          {connected && !!serverUrl && (
            <Text style={styles.url} selectable>
              {serverUrl}
            </Text>
          )}

          {connected ? (
            <>
              <Pressable
                style={[styles.primaryBtn, signaling && styles.btnDisabled]}
                onPress={onOpenMachine}
                disabled={signaling}
              >
                {signaling ? (
                  <ActivityIndicator color="#120a24" />
                ) : (
                  <Text style={styles.primaryBtnText}>Open the pane</Text>
                )}
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={onSignalOnly}>
                <Text style={styles.secondaryBtnText}>
                  Wake the pane again
                </Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => router.push('/workshop-config')}
              >
                <Text style={styles.secondaryBtnText}>Workshop settings</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={onConnect}>
              <Text style={styles.primaryBtnText}>Connect to workshop</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.hint}>
        On the laptop the workshop server must be running (python3 start.py). Esc quits the pane. Enter toggles fullscreen.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#120a24',
    paddingHorizontal: 24,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  backText: {
    color: '#b8a0d8',
    fontWeight: '700',
    fontSize: 15,
  },
  emoji: {
    fontSize: 42,
    textAlign: 'center',
    marginTop: 8,
  },
  title: {
    color: '#7df5d8',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    color: '#b8a0d8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#1a1325',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(125, 245, 216, 0.2)',
    padding: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  dotOn: { backgroundColor: '#4adeb0' },
  dotOff: { backgroundColor: '#f87171' },
  statusText: {
    color: '#f0e6ff',
    fontWeight: '600',
    fontSize: 15,
  },
  url: {
    color: '#7df5d8',
    fontSize: 13,
    marginBottom: 16,
    opacity: 0.9,
  },
  primaryBtn: {
    backgroundColor: '#4adeb0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#120a24',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(125, 245, 216, 0.35)',
    marginBottom: 10,
  },
  secondaryBtnText: {
    color: '#7df5d8',
    fontWeight: '700',
    fontSize: 14,
  },
  btnDisabled: { opacity: 0.7 },
  hint: {
    color: 'rgba(184, 160, 216, 0.85)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 8,
  },
});
