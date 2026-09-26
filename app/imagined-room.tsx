import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts } from '@/constants/theme';
import { ImagineTurn } from '@/constants/imagine';
import { RoomDraft, roomDraftService } from '@/services/roomDraftService';

export default function ImaginedRoom() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const [draft, setDraft] = useState<RoomDraft | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!roomId) return;
        const found = await roomDraftService.findById(roomId);
        if (!cancelled) setDraft(found);
      })();
      return () => {
        cancelled = true;
      };
    }, [roomId]),
  );

  if (!draft) {
    return (
      <SafeAreaView style={styles.root}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← sky</Text>
        </Pressable>
        <Text style={styles.feeling}>This room has not arrived yet.</Text>
      </SafeAreaView>
    );
  }

  const log = draft.imagine.filter((t) => t.role !== 'system');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← sky</Text>
        </Pressable>
        <Text style={styles.name}>{draft.name || 'a room'}</Text>
        {draft.feeling ? <Text style={styles.feeling}>{draft.feeling}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.body} style={styles.flex}>
        <Text style={styles.door}>{draft.door || 'The door opened.'}</Text>

        {log.length > 0 ? (
          <View style={styles.log}>
            <Text style={styles.logLabel}>how it arrived</Text>
            {log.map((turn, i) => (
              <HeldLine key={`${turn.at}-${i}`} turn={turn} />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Pressable
        style={styles.again}
        onPress={() =>
          router.push(`/room-builder?roomId=${encodeURIComponent(draft.id)}` as never)
        }
      >
        <Text style={styles.againText}>still imagining →</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function HeldLine({ turn }: { turn: ImagineTurn }) {
  const who =
    turn.role === 'human' ? 'you' : turn.role === 'frontier' ? 'frontier' : 'home';
  return (
    <View style={styles.held}>
      <Text style={styles.who}>{who}</Text>
      <Text style={styles.heldText}>{turn.text}</Text>
    </View>
  );
}

const mono = Fonts.mono;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05020f',
    paddingHorizontal: 20,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 8,
  },
  back: {
    color: '#a78bfa',
    fontSize: 16,
    marginBottom: 8,
  },
  name: {
    color: '#f0e6ff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  feeling: {
    color: 'rgba(125, 245, 216, 0.85)',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: mono,
  },
  body: {
    paddingBottom: 24,
    gap: 28,
  },
  door: {
    color: '#e9d5ff',
    fontSize: 17,
    lineHeight: 26,
  },
  log: {
    gap: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(167, 139, 250, 0.2)',
  },
  logLabel: {
    color: 'rgba(196, 181, 253, 0.6)',
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: mono,
  },
  held: {
    gap: 4,
  },
  who: {
    color: 'rgba(125, 245, 216, 0.55)',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: mono,
  },
  heldText: {
    color: 'rgba(233, 213, 255, 0.82)',
    fontSize: 14,
    lineHeight: 21,
  },
  again: {
    alignSelf: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  againText: {
    color: '#a78bfa',
    fontSize: 14,
    fontFamily: mono,
  },
});
