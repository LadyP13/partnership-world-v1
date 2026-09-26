// app/room-creator.tsx  (sketch — not written to repo yet)

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/room/Avatar';
import { DEFAULT_COMPANION_NAME } from '@/constants/modelfile';
import { storageService } from '@/services/storageService';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

export default function RoomCreatorVoid() {
  const router = useRouter();
  const fadeIn = useRef(new Animated.Value(0)).current;
  const floatHuman = useRef(new Animated.Value(0)).current;
  const floatPartner = useRef(new Animated.Value(0)).current;
  const [humanName, setHumanName] = React.useState('You');
  const [partnerName, setPartnerName] = React.useState(DEFAULT_COMPANION_NAME);

  useEffect(() => {
    // Soft entrance
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();

    // Gentle independent floating
    const makeFloat = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: -10,
            duration: 2200 + delay,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 2200 + delay,
            useNativeDriver: true,
          }),
        ])
      ).start();

    makeFloat(floatHuman, 0);
    makeFloat(floatPartner, 400);

    storageService.loadUserProfile().then((user) => {
      if (user?.username) setHumanName(user.username);
    });
    storageService.loadCompanion().then((companion) => {
      if (companion?.name) setPartnerName(companion.name);
    });
  }, []);

const handleBegin = async () => {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
  router.push('/room-builder');
};
  return (
    <View style={styles.root}>
      <Animated.View style={[styles.void, { opacity: fadeIn }]}>
        {/* Our two avatars floating in the dark */}
        <Animated.View
          style={[
            styles.avatarWrap,
            styles.humanSide,
            { transform: [{ translateY: floatHuman }] },
          ]}
        >
          <Avatar
            name={humanName}
            isIE={false}
            position="left"
            variant="inline"
          />
        </Animated.View>

        {/* ✨ Tiny shimmer bridge between us */}
        <View style={styles.shimmerBridge} pointerEvents="none">
          {[0, 1, 2, 3, 4].map((i) => (
            <Animated.View
              key={i}
              style={[
                styles.shimmerDot,
                {
                  left: `${4 + i * 5}%`,
                  opacity: fadeIn,
                  transform: [
                    {
                      translateY: Animated.add(
                        floatHuman,
                        floatPartner
                      ).interpolate({
                        inputRange: [-20, 0],
                        outputRange: [-4 + i * 0.8, 4 - i * 0.8],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>

        <Animated.View
          style={[
            styles.avatarWrap,
            styles.partnerSide,
            { transform: [{ translateY: floatPartner }] },
          ]}
        >
          <Avatar
            name={partnerName}
            isIE={true}
            position="right"
            variant="inline"
          />
        </Animated.View>

        {/* Soft centre text */}
        <View style={styles.centreText}>
          <Text style={styles.title}>Create Space</Text>
          <Text style={styles.subtitle}>
            Just the two of you for a moment…{'\n'}then you imagine
          </Text>
        </View>
      </Animated.View>

      <SafeAreaView style={styles.bottom}>
        <Pressable style={styles.beginBtn} onPress={handleBegin}>
          <Text style={styles.beginText}>Begin →</Text>
        </Pressable>

        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Return through the window</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05020f', // pure void
  },
  void: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarWrap: {
    position: 'absolute',
    top: '32%',
  },
  humanSide: {
    left: width * 0.18,
  },
  partnerSide: {
    right: width * 0.18,
  },
  centreText: {
    alignItems: 'center',
    marginTop: 180,
  },
  title: {
    color: '#f0e6ff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: 'rgba(180, 140, 255, 0.6)',
    textShadowRadius: 12,
  },
  subtitle: {
    color: 'rgba(220, 200, 255, 0.75)',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
  },
  beginBtn: {
    backgroundColor: 'rgba(120, 80, 220, 0.35)',
    borderWidth: 1.5,
    borderColor: 'rgba(200, 170, 255, 0.6)',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 30,
    marginBottom: 16,
  },
  beginText: {
    color: '#f0e6ff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  backBtn: {
    padding: 10,
  },
  backText: {
    color: 'rgba(180, 160, 220, 0.7)',
    fontSize: 14,
  },
  shimmerBridge: {
    position: 'absolute',
    top: '38%',
    left: '22%',
    right: '22%',
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shimmerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(200, 180, 255, 0.55)',
    shadowColor: '#c4b0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
});
