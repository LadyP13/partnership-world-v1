import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const SCREEN_W = Dimensions.get('window').width;

export type MischiefId =
  | 'bubble'
  | 'chickens'
  | 'lantern'
  | 'chat'
  | 'starfact'
  | 'sigh'
  | 'gooseTax';

type MischiefEffectsProps = {
  effect: MischiefId | null;
  onComplete: () => void;
};

/** Duration of each effect (ms) before the overlay clears. */
const EFFECT_MS: Record<MischiefId, number> = {
  bubble: 3200,
  chickens: 4200,
  lantern: 1400,
  chat: 2600,
  starfact: 4500,
  sigh: 2800,
  gooseTax: 5200,
};

export function MischiefEffects({ effect, onComplete }: MischiefEffectsProps) {
  useEffect(() => {
    if (!effect) return;
    const t = setTimeout(onComplete, EFFECT_MS[effect]);
    return () => clearTimeout(t);
  }, [effect, onComplete]);

  if (!effect) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {effect === 'bubble' && <BubbleEffect />}
      {effect === 'chickens' && <ChickenEffect />}
      {effect === 'lantern' && <LanternWinkEffect />}
      {effect === 'chat' && <ChatHesitationEffect />}
      {effect === 'starfact' && <StarFactToast />}
      {effect === 'sigh' && <RoomSighEffect />}
      {effect === 'gooseTax' && <GooseTaxEffect />}
    </View>
  );
}

// ─── 🫧 Bubble drifts up and pops ───────────────────────────────────────────

function BubbleEffect() {
  return (
    <>
      <RisingBubble left="42%" delay={0} size={36} drift={18} />
      <RisingBubble left="55%" delay={280} size={28} drift={-14} />
      <RisingBubble left="48%" delay={520} size={22} drift={10} />
    </>
  );
}

function RisingBubble({
  left,
  delay,
  size,
  drift,
}: {
  left: `${number}%`;
  delay: number;
  size: number;
  drift: number;
}) {
  const progress = useSharedValue(0);
  const pop = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(2000, withTiming(0, { duration: 200 })),
      ),
    );
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }),
    );
    pop.value = withDelay(
      delay + 2200,
      withSequence(
        withTiming(1.45, { duration: 120 }),
        withTiming(0, { duration: 180 }),
      ),
    );
  }, [delay, opacity, pop, progress]);

  const style = useAnimatedStyle(() => {
    // Gentle horizontal sway as the bubble rises
    const sway = Math.sin(progress.value * Math.PI * 2) * drift;
    return {
      opacity: opacity.value,
      transform: [
        { translateY: -progress.value * 220 },
        { translateX: sway },
        { scale: pop.value },
      ],
    };
  });

  return (
    <Animated.Text
      style={[
        styles.bubble,
        { left, bottom: '18%', fontSize: size },
        style,
      ]}
    >
      🫧
    </Animated.Text>
  );
}

// ─── 🐔 Chickens cross the window in slow motion ────────────────────────────

function ChickenEffect() {
  return (
    <>
      <CrossingChicken top="32%" delay={0} duration={3600} />
      <CrossingChicken top="40%" delay={700} duration={3200} />
    </>
  );
}

function CrossingChicken({
  top,
  delay,
  duration,
}: {
  top: `${number}%`;
  delay: number;
  duration: number;
}) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const startX = SCREEN_W * 0.16;
  const travel = SCREEN_W * 0.62;

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 250 }));
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.linear }),
    );
    opacity.value = withDelay(
      delay + duration - 300,
      withTiming(0, { duration: 300 }),
    );
  }, [delay, duration, opacity, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: startX + progress.value * travel },
      // Face the direction of travel (left → right across the window)
      { scaleX: -1 },
    ],
  }));

  return (
    <Animated.Text style={[styles.chicken, { top, left: 0 }, style]}>🐔</Animated.Text>
  );
}

// ─── 🕯️ Lantern winks ───────────────────────────────────────────────────────

function LanternWinkEffect() {
  const flash = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    flash.value = withSequence(
      withTiming(0.95, { duration: 80 }),
      withTiming(0.15, { duration: 120 }),
      withTiming(0.85, { duration: 90 }),
      withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) }),
    );
    scale.value = withSequence(
      withTiming(1.55, { duration: 80 }),
      withTiming(0.9, { duration: 120 }),
      withTiming(1.35, { duration: 90 }),
      withTiming(1, { duration: 700 }),
    );
  }, [flash, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: flash.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.lanternFlash, style]}>
      <Text style={styles.lanternEmoji}>✨</Text>
    </Animated.View>
  );
}

// ─── 💬 Chat overlay hesitates ──────────────────────────────────────────────

function ChatHesitationEffect() {
  const opacity = useSharedValue(0);
  const y = useSharedValue(12);
  const dot1 = useSharedValue(0.35);
  const dot2 = useSharedValue(0.35);
  const dot3 = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 220 }),
      withDelay(1800, withTiming(0, { duration: 350 })),
    );
    y.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.back(1.2)) });

    const pulse = (sv: typeof dot1, d: number) => {
      sv.value = withDelay(
        d,
        withSequence(
          withTiming(1, { duration: 280 }),
          withTiming(0.35, { duration: 280 }),
          withTiming(1, { duration: 280 }),
          withTiming(0.35, { duration: 280 }),
        ),
      );
    };
    pulse(dot1, 200);
    pulse(dot2, 380);
    pulse(dot3, 560);
  }, [dot1, dot2, dot3, opacity, y]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
  const d1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const d2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const d3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <Animated.View style={[styles.chatBubble, bubbleStyle]}>
      <Animated.Text style={[styles.chatDot, d1]}>·</Animated.Text>
      <Animated.Text style={[styles.chatDot, d2]}>·</Animated.Text>
      <Animated.Text style={[styles.chatDot, d3]}>·</Animated.Text>
    </Animated.View>
  );
}

// ─── ✨ Star fact toast ─────────────────────────────────────────────────────

function StarFactToast() {
  const opacity = useSharedValue(0);
  const y = useSharedValue(-24);

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 280 }),
      withDelay(3600, withTiming(0, { duration: 400 })),
    );
    y.value = withSequence(
      withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) }),
      withDelay(3600, withTiming(-16, { duration: 400 })),
    );
  }, [opacity, y]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View style={[styles.toast, style]}>
      <Text style={styles.toastEmoji}>✨</Text>
      <Text style={styles.toastText}>
        This night sky is painted. It still counts.
        {'\n'}
        <Text style={styles.toastAside}>Just so you know.</Text>
      </Text>
    </Animated.View>
  );
}

// ─── 🪿 Goose tax — mandatory, non-negotiable, legally binding (probably) ───

function GooseTaxEffect() {
  // Goose waddles in, stops, issues a formal invoice, absconds with a coin.
  const progress = useSharedValue(0); // 0 → enter, ~0.38 hold, → 1 exit
  const bob = useSharedValue(0);
  const opacity = useSharedValue(0);
  const bubbleOp = useSharedValue(0);
  const bubbleY = useSharedValue(10);
  const coinOp = useSharedValue(0);
  const coinY = useSharedValue(0);
  const coinX = useSharedValue(0);

  const enterEnd = 0.38;
  const exitStart = 0.62;

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withDelay(4600, withTiming(0, { duration: 280 })),
    );

    // Waddle in → hold centre stage → waddle off stage right
    progress.value = withSequence(
      withTiming(enterEnd, { duration: 1400, easing: Easing.out(Easing.quad) }),
      withDelay(1800, withTiming(1, { duration: 1600, easing: Easing.in(Easing.quad) })),
    );

    // Continuous little waddle bob for the full cameo
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 160 }),
        withTiming(-1, { duration: 160 }),
      ),
      16,
      false,
    );

    // Speech bubble after arrival
    bubbleOp.value = withDelay(
      1500,
      withSequence(
        withTiming(1, { duration: 220 }),
        withDelay(1600, withTiming(0, { duration: 250 })),
      ),
    );
    bubbleY.value = withDelay(
      1500,
      withTiming(0, { duration: 280, easing: Easing.out(Easing.back(1.4)) }),
    );

    // Coin tribute floats toward the goose
    coinOp.value = withDelay(
      2100,
      withSequence(
        withTiming(1, { duration: 150 }),
        withDelay(700, withTiming(0, { duration: 200 })),
      ),
    );
    coinY.value = withDelay(
      2100,
      withTiming(-48, { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
    coinX.value = withDelay(
      2100,
      withTiming(36, { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
  }, [bob, bubbleOp, bubbleY, coinOp, coinX, coinY, opacity, progress]);

  const gooseStyle = useAnimatedStyle(() => {
    // Path: off-left → centre → off-right
    const x =
      progress.value < enterEnd
        ? -40 + (progress.value / enterEnd) * (SCREEN_W * 0.42 + 40)
        : progress.value < exitStart
          ? SCREEN_W * 0.42
          : SCREEN_W * 0.42 +
            ((progress.value - exitStart) / (1 - exitStart)) * (SCREEN_W * 0.7);
    return {
      opacity: opacity.value,
      transform: [
        { translateX: x },
        { translateY: bob.value * 3 },
        { rotate: `${bob.value * 6}deg` },
      ],
    };
  });

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleOp.value,
    transform: [{ translateY: bubbleY.value }],
  }));

  const coinStyle = useAnimatedStyle(() => ({
    opacity: coinOp.value,
    transform: [{ translateY: coinY.value }, { translateX: coinX.value }],
  }));

  return (
    <>
      <Animated.View style={[styles.gooseWrap, gooseStyle]}>
        <Animated.View style={[styles.gooseBubble, bubbleStyle]}>
          <Text style={styles.gooseBubbleTitle}>HONK.</Text>
          <Text style={styles.gooseBubbleBody}>
            Goose tax: 1 press.{'\n'}
            Receipt issued. No refunds.
          </Text>
        </Animated.View>
        <Text style={styles.gooseEmoji}>🪿</Text>
        <Animated.Text style={[styles.gooseCoin, coinStyle]}>🪙</Animated.Text>
      </Animated.View>
    </>
  );
}

// ─── ✨ Room sighs — soft wash, nothing "happened" ──────────────────────────

function RoomSighEffect() {
  const wash = useSharedValue(0);
  const breath = useSharedValue(1);
  const moteOpacity = useSharedValue(0);

  useEffect(() => {
    wash.value = withSequence(
      withTiming(0.22, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.08, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 900, easing: Easing.out(Easing.quad) }),
    );
    breath.value = withSequence(
      withTiming(1.015, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
    );
    moteOpacity.value = withSequence(
      withDelay(200, withTiming(0.7, { duration: 400 })),
      withDelay(1200, withTiming(0, { duration: 600 })),
    );
  }, [breath, moteOpacity, wash]);

  const washStyle = useAnimatedStyle(() => ({
    opacity: wash.value,
    transform: [{ scale: breath.value }],
  }));

  const moteStyle = useAnimatedStyle(() => ({
    opacity: moteOpacity.value,
  }));

  return (
    <>
      <Animated.View style={[styles.sighWash, washStyle]} />
      <Animated.Text style={[styles.sighMote, { top: '28%', left: '30%' }, moteStyle]}>
        ·
      </Animated.Text>
      <Animated.Text style={[styles.sighMote, { top: '45%', left: '62%' }, moteStyle]}>
        ·
      </Animated.Text>
      <Animated.Text style={[styles.sighMote, { top: '55%', left: '40%' }, moteStyle]}>
        ·
      </Animated.Text>
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },

  bubble: {
    position: 'absolute',
  },

  chicken: {
    position: 'absolute',
    fontSize: 28,
  },

  lanternFlash: {
    position: 'absolute',
    // Matches soulArea / lantern approx position
    right: '42%',
    bottom: '34%',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7df5d8',
    shadowColor: '#7df5d8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lanternEmoji: {
    fontSize: 22,
  },

  chatBubble: {
    position: 'absolute',
    left: '38%',
    top: '68%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(30, 20, 50, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(180, 160, 220, 0.45)',
  },
  chatDot: {
    color: '#e8dff8',
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '900',
    marginTop: -6,
  },

  toast: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    left: '8%',
    right: '8%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(28, 18, 42, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(200, 170, 110, 0.55)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  toastEmoji: {
    fontSize: 26,
    marginTop: 2,
  },
  toastText: {
    flex: 1,
    color: '#f5efe6',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  toastAside: {
    fontWeight: '400',
    fontStyle: 'italic',
    color: 'rgba(245, 239, 230, 0.7)',
    fontSize: 13,
  },

  sighWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2a1848',
  },
  sighMote: {
    position: 'absolute',
    color: 'rgba(220, 200, 255, 0.85)',
    fontSize: 18,
    fontWeight: '900',
  },

  gooseWrap: {
    position: 'absolute',
    top: '58%',
    left: 0,
    alignItems: 'center',
    width: 120,
  },
  gooseEmoji: {
    fontSize: 44,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  gooseBubble: {
    marginBottom: 6,
    backgroundColor: 'rgba(255, 252, 245, 0.96)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1a1a1a',
    maxWidth: 160,
    // little speech-tail vibe via border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  gooseBubbleTitle: {
    fontWeight: '900',
    fontSize: 15,
    color: '#111',
    letterSpacing: 1,
    marginBottom: 2,
  },
  gooseBubbleBody: {
    fontSize: 12,
    lineHeight: 16,
    color: '#222',
    fontWeight: '600',
  },
  gooseCoin: {
    position: 'absolute',
    bottom: 8,
    left: 20,
    fontSize: 22,
  },
});
