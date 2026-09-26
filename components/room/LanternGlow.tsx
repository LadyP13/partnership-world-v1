import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { PartnerPresence } from '@/contexts/PartnerPresenceContext';

type LanternGlowProps = {
  presence: PartnerPresence;
  pulseTick?: number;
};

export function LanternGlow({ presence, pulseTick = 0 }: LanternGlowProps) {
  const glow = useSharedValue(0.35);
  const scale = useSharedValue(1);
  const core = useSharedValue(0.6);

  useEffect(() => {
    if (presence === 'sleeping') {
      glow.value = withRepeat(
        withSequence(
          withTiming(0.15, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.28, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
      scale.value = withTiming(0.9, { duration: 600 });
      core.value = withTiming(0.25, { duration: 600 });
      return;
    }

    if (presence === 'thinking') {
      glow.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 900 }),
          withTiming(0.96, { duration: 900 }),
        ),
        -1,
        true,
      );
      core.value = withTiming(0.75, { duration: 400 });
      return;
    }

    if (presence === 'speaking') {
      glow.value = withRepeat(
        withSequence(
          withTiming(0.85, { duration: 500, easing: Easing.out(Easing.quad) }),
          withTiming(0.45, { duration: 500, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        true,
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.14, { duration: 500 }),
          withTiming(1.02, { duration: 500 }),
        ),
        -1,
        true,
      );
      core.value = withTiming(1, { duration: 300 });
      return;
    }

    // idle — soft living breath
    glow.value = withRepeat(
      withSequence(
        withTiming(0.42, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.28, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.98, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    core.value = withRepeat(
      withSequence(
        withTiming(0.72, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.5, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [presence, glow, scale, core]);

  // Extra flicker when a new stream chunk lands
  useEffect(() => {
    if (presence !== 'speaking' || pulseTick === 0) return;
    glow.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0.6, { duration: 280 }),
    );
    scale.value = withSequence(
      withTiming(1.18, { duration: 120 }),
      withTiming(1.06, { duration: 280 }),
    );
  }, [pulseTick, presence, glow, scale]);

  const outerStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: scale.value }],
  }));

  const innerStyle = useAnimatedStyle(() => ({
    opacity: core.value,
    transform: [{ scale: 0.55 + core.value * 0.25 }],
  }));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.outerGlow, outerStyle]} />
      <Animated.View style={[styles.midGlow, outerStyle]} />
      <Animated.View style={[styles.core, innerStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerGlow: {
    position: 'absolute',
    width: '140%',
    height: '200%',
    borderRadius: 999,
    backgroundColor: '#7df5d8',
    shadowColor: '#7df5d8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 10,
  },
  midGlow: {
    position: 'absolute',
    width: '90%',
    height: '130%',
    borderRadius: 999,
    backgroundColor: '#4adeb0',
  },
  core: {
    width: '35%',
    height: '50%',
    borderRadius: 999,
    backgroundColor: '#f0fffe',
  },
});