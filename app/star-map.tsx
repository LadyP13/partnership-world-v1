import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ImageBackground,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { workshopService } from '@/services/workshopService';
import { STARS, StarRoom, customStarPosition } from '@/constants/starRooms';
import { RoomDraft, roomDraftService } from '@/services/roomDraftService';

/**
 * Star Map — open sky, tappable stars.
 * Portal video is parked until expo-video is wired properly.
 */

export default function StarMapScreen() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customRooms, setCustomRooms] = useState<RoomDraft[]>([]);

  useFocusEffect(
    useCallback(() => {
      roomDraftService.loadEmerged().then(setCustomRooms);
    }, []),
  );

  const onTwinStarPress = useCallback(async () => {
    await workshopService.loadConfig();
    const linked = workshopService.isLoggedIn();

    if (!linked) {
      Alert.alert(
        'Twin Workshop',
        'Connect to the home workshop first — the pane lives on the laptop.',
        [
          { text: 'Stay among the stars', style: 'cancel' },
          {
            text: 'Connect workshop',
            onPress: () => router.push('/workshop-config'),
          },
        ],
      );
      return;
    }

    Alert.alert(
      'Move to your machine ✨',
      'This star wakes the workshop pane on the laptop — the local presence in the room.',
      [
        { text: 'Stay among the stars', style: 'cancel' },
        {
          text: 'Open the pane',
          onPress: () => router.push('/twin-workshop'),
        },
      ],
    );
  }, [router]);

  const onStarPress = useCallback(
    async (star: StarRoom) => {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        /* haptics optional */
      }
      setSelectedId(star.id);

      // Twin Workshop: connect-gate + hand off to machine (not a phone room)
      if (star.id === 'twin') {
        await onTwinStarPress();
        return;
      }

      if (!star.route) {
        Alert.alert(star.label, star.hint);
        return;
      }

      // RN web Alert.alert is a no-op — go straight there
      if (Platform.OS === 'web') {
        router.push(star.route as any);
        return;
      }

      // Soft confirm so accidental taps don't yank you out of the sky
      Alert.alert(star.label, star.hint, [
        { text: 'Stay among the stars', style: 'cancel' },
        {
          text: 'Go there',
          onPress: () => router.push(star.route as any),
        },
      ]);
    },
    [router, onTwinStarPress],
  );

  return (
    <View style={styles.root}>
      <View style={styles.skyLayer}>
          <ImageBackground
            source={require('../assets/images/starry-sky.jpg')}
            style={styles.skyImage}
            resizeMode="cover"
          >
            <SafeAreaView style={styles.skyChrome}>
              <Pressable
                style={styles.backBtn}
                onPress={() => router.back()}
                accessibilityLabel="Return through the window"
              >
                <Text style={styles.backText}>← Window</Text>
              </Pressable>
              <Text style={styles.skyTitle}>Star Map</Text>
              <Text style={styles.skySubtitle}>Tap a star to visit a room</Text>
            </SafeAreaView>

            {[
              ...STARS,
              ...customRooms.map((draft, i) => {
                const pos = customStarPosition(i);
                const custom: StarRoom = {
                  id: draft.id,
                  label: draft.name,
                  left: pos.left,
                  top: pos.top,
                  size: 20,
                  route: `/imagined-room?roomId=${encodeURIComponent(draft.id)}`,
                  hint: draft.feeling || 'A room that emerged together',
                };
                return custom;
              }),
            ].map((star) => {
              const selected = selectedId === star.id;
              return (
                <Pressable
                  key={star.id}
                  style={[
                    styles.starHit,
                    {
                      left: star.left,
                      top: star.top,
                      width: star.size + 28,
                      height: star.size + 28,
                      marginLeft: -(star.size + 28) / 2,
                      marginTop: -(star.size + 28) / 2,
                    },
                  ]}
                  onPress={() => onStarPress(star)}
                  accessibilityLabel={`${star.label} star. ${star.hint}`}
                >
                  <View
                    style={[
                      styles.starCore,
                      {
                        width: star.size,
                        height: star.size,
                        borderRadius: star.size / 2,
                      },
                      selected && styles.starCoreSelected,
                    ]}
                  />
                  <Text style={[styles.starLabel, selected && styles.starLabelSelected]}>
                    {star.label}
                  </Text>
                </Pressable>
              );
            })}
          </ImageBackground>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05020f',
  },
  skyLayer: {
    flex: 1,
  },
  skyImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  skyChrome: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(5, 2, 15, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(180, 160, 255, 0.4)',
    marginBottom: 10,
  },
  backText: {
    color: '#d8c7ff',
    fontWeight: '700',
    fontSize: 14,
  },
  skyTitle: {
    color: '#f0e6ff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  skySubtitle: {
    color: 'rgba(220, 200, 255, 0.8)',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  starHit: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starCore: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    shadowColor: '#c4b0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  starCoreSelected: {
    backgroundColor: '#ffe9a8',
    shadowColor: '#ffd56a',
    borderColor: '#fff6d0',
  },
  starLabel: {
    marginTop: 4,
    color: 'rgba(240, 230, 255, 0.88)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  starLabelSelected: {
    color: '#ffe9a8',
  },
});
