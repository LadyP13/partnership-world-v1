import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Fonts } from '@/constants/theme';
import { IMAGINE_PREFIX, ImagineTurn } from '@/constants/imagine';
import { imagineService } from '@/services/imagineService';
import {
  RoomDraft,
  createEmptyDraft,
  roomDraftService,
} from '@/services/roomDraftService';

type HomeStatus = { ok: true; model: string } | { ok: false; error: string } | null;

export default function RoomBuilder() {
  const router = useRouter();
  const { roomId: paramId } = useLocalSearchParams<{ roomId?: string }>();

  const [draft, setDraft] = useState<RoomDraft>(() => createEmptyDraft());
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [home, setHome] = useState<HomeStatus>(null);
  const [unfinished, setUnfinished] = useState<RoomDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const cursor = useRef(new Animated.Value(1)).current;

  const firstHuman = !draft.imagine.some((t) => t.role === 'human');

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cursor, { toValue: 0.15, duration: 520, useNativeDriver: true }),
        Animated.timing(cursor, { toValue: 1, duration: 520, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [cursor]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (paramId) {
        const found = await roomDraftService.findById(paramId);
        if (found && !cancelled) setDraft(found);
      }
      const [probe, imagining] = await Promise.all([
        imagineService.probeHome(),
        roomDraftService.loadImagining(),
      ]);
      if (cancelled) return;
      setHome(probe);
      setUnfinished(imagining);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [paramId]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [draft.imagine.length, busy]);

  const run = useCallback(
    async (opts: { userText?: string; knock?: boolean; humanReady?: boolean }) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        /* optional */
      }
      try {
        const step = await imagineService.step(draft, opts);
        setDraft(step.draft);
        setInput('');
        if (step.kind === 'ready') {
          router.replace(
            `/imagined-room?roomId=${encodeURIComponent(step.draft.id)}` as never,
          );
          return;
        }
        const imagining = await roomDraftService.loadImagining();
        setUnfinished(imagining);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'The room went quiet.');
      } finally {
        setBusy(false);
      }
    },
    [busy, draft, router],
  );

  const onSend = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    run({ userText: text });
  }, [input, busy, run]);

  const pickUnfinished = useCallback(async (next: RoomDraft) => {
    setDraft(next);
    setInput('');
    setError(null);
  }, []);

  const pickNew = useCallback(() => {
    setDraft(createEmptyDraft());
    setInput('');
    setError(null);
  }, []);

  const homeLabel =
    home == null
      ? 'listening for the Pi…'
      : home.ok
        ? `home model · ${home.model}`
        : 'home model away · knock can still reach the frontier';

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>← void</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            imagine if
          </Text>
          <Text style={styles.homeTag} numberOfLines={1}>
            {homeLabel}
          </Text>
        </View>

        {unfinished.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              onPress={pickNew}
              style={[styles.chip, !unfinished.some((u) => u.id === draft.id) && styles.chipOn]}
            >
              <Text style={styles.chipText}>+ new</Text>
            </Pressable>
            {unfinished.map((room) => {
              const on = room.id === draft.id;
              const label =
                room.name.trim() ||
                room.imagine.find((t) => t.role === 'human')?.text.replace(IMAGINE_PREFIX, '') ||
                'still imagining';
              return (
                <Pressable
                  key={room.id}
                  onPress={() => pickUnfinished(room)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={styles.chipText} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.terminal}>
          <View style={styles.terminalBar}>
            <View style={styles.dot} />
            <Text style={styles.terminalBarText}>create space · not a menu</Text>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.log}
            contentContainerStyle={styles.logPad}
            keyboardShouldPersistTaps="handled"
          >
            {draft.imagine.length === 0 && !busy ? (
              <Text style={styles.ghost}>
                The sentence is already started.{'\n'}
                Type what you are imagining. The home model will ask until the room is real enough to exist.
              </Text>
            ) : null}

            {draft.imagine.map((turn, i) => (
              <TurnLine key={`${turn.at}-${i}`} turn={turn} />
            ))}

            {busy ? (
              <View style={styles.line}>
                <Text style={styles.prompt}> </Text>
                <Animated.Text style={[styles.cursor, { opacity: cursor }]}>▍</Animated.Text>
                <Text style={styles.thinking}> listening</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.inputRow}>
            <Text style={styles.prompt}>{firstHuman ? IMAGINE_PREFIX : '› '}</Text>
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={onSend}
              placeholder={firstHuman ? 'the floor remembered every footstep…' : 'and then…'}
              placeholderTextColor="rgba(125, 245, 216, 0.28)"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect
              returnKeyType="send"
              editable={!busy && ready}
              blurOnSubmit={false}
            />
            <Animated.Text style={[styles.cursor, { opacity: busy ? 0 : cursor }]}>▍</Animated.Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => run({ knock: true })}
            disabled={busy || draft.imagine.length === 0}
            style={[styles.action, (busy || draft.imagine.length === 0) && styles.actionOff]}
          >
            <Text style={styles.actionText}>knock</Text>
          </Pressable>
          <Pressable
            onPress={onSend}
            disabled={busy || !input.trim()}
            style={[styles.action, styles.actionMain, (busy || !input.trim()) && styles.actionOff]}
          >
            <Text style={[styles.actionText, styles.actionMainText]}>send</Text>
          </Pressable>
          <Pressable
            onPress={() => run({ humanReady: true })}
            disabled={busy || draft.imagine.filter((t) => t.role === 'human').length < 1}
            style={[
              styles.action,
              (busy || draft.imagine.filter((t) => t.role === 'human').length < 1) &&
                styles.actionOff,
            ]}
          >
            <Text style={styles.actionText}>it&apos;s ready</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TurnLine({ turn }: { turn: ImagineTurn }) {
  if (turn.role === 'system') {
    return <Text style={styles.system}>{turn.text}</Text>;
  }
  if (turn.role === 'human') {
    return (
      <View style={styles.line}>
        <Text style={styles.human}>{turn.text}</Text>
      </View>
    );
  }
  const tag = turn.role === 'frontier' ? 'frontier' : 'home';
  return (
    <View style={styles.reply}>
      <Text style={[styles.tag, turn.role === 'frontier' && styles.tagFrontier]}>{tag}</Text>
      <Text style={[styles.replyText, turn.role === 'frontier' && styles.replyFrontier]}>
        {turn.text}
      </Text>
    </View>
  );
}

const mono = Fonts.mono;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05020f',
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 2,
  },
  back: {
    color: '#a78bfa',
    fontSize: 16,
    marginBottom: 4,
  },
  title: {
    color: '#e9d5ff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: mono,
  },
  homeTag: {
    color: 'rgba(125, 245, 216, 0.7)',
    fontSize: 11,
    fontFamily: mono,
    marginTop: 2,
  },
  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 42,
  },
  chipRow: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
    paddingBottom: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.28)',
    maxWidth: 180,
  },
  chipOn: {
    borderColor: '#7df5d8',
  },
  chipText: {
    color: '#c4b5fd',
    fontSize: 12,
    fontFamily: mono,
  },
  terminal: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(125, 245, 216, 0.22)',
    backgroundColor: '#0a0714',
    overflow: 'hidden',
  },
  terminalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(125, 245, 216, 0.12)',
    backgroundColor: 'rgba(125, 245, 216, 0.04)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#7df5d8',
  },
  terminalBarText: {
    color: 'rgba(196, 181, 253, 0.7)',
    fontSize: 11,
    fontFamily: mono,
    letterSpacing: 0.6,
  },
  log: {
    flex: 1,
  },
  logPad: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 12,
  },
  ghost: {
    color: 'rgba(196, 181, 253, 0.55)',
    fontSize: 14,
    lineHeight: 22,
    fontFamily: mono,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  human: {
    color: '#e9d5ff',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: mono,
  },
  reply: {
    gap: 4,
    paddingLeft: 4,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(125, 245, 216, 0.35)',
  },
  tag: {
    color: '#7df5d8',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: mono,
  },
  tagFrontier: {
    color: '#e8d5a3',
  },
  replyText: {
    color: '#c8f5e4',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: mono,
  },
  replyFrontier: {
    color: '#f3e6c4',
  },
  system: {
    color: 'rgba(232, 213, 163, 0.8)',
    fontSize: 12,
    fontStyle: 'italic',
    fontFamily: mono,
    lineHeight: 18,
  },
  thinking: {
    color: 'rgba(125, 245, 216, 0.6)',
    fontSize: 13,
    fontFamily: mono,
  },
  error: {
    color: '#fca5a5',
    fontSize: 13,
    fontFamily: mono,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(125, 245, 216, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
    gap: 0,
  },
  prompt: {
    color: '#7df5d8',
    fontSize: 14,
    fontFamily: mono,
  },
  input: {
    flex: 1,
    color: '#e9d5ff',
    fontSize: 15,
    fontFamily: mono,
    paddingVertical: 8,
  },
  cursor: {
    color: '#7df5d8',
    fontSize: 14,
    fontFamily: mono,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    minHeight: 44,
    justifyContent: 'center',
  },
  actionMain: {
    borderColor: '#7df5d8',
    backgroundColor: 'rgba(125, 245, 216, 0.08)',
  },
  actionOff: {
    opacity: 0.35,
  },
  actionText: {
    color: '#c4b5fd',
    fontSize: 13,
    fontFamily: mono,
    letterSpacing: 0.8,
  },
  actionMainText: {
    color: '#ecfdf8',
  },
});
