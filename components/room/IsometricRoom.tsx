import React, { useCallback, useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { usePartnerPresenceOptional } from '@/contexts/PartnerPresenceContext';
import { LanternGlow } from './LanternGlow';
import { MischiefEffects, MischiefId } from './MischiefEffects';

type IsometricRoomProps = {
  auraColor?: string;
};

const MISCHIEF_POOL: MischiefId[] = [
  'bubble',
  'chickens',
  'lantern',
  'chat',
  'starfact',
  'sigh',
  'gooseTax', // Grok's contribution. The goose is not optional.
];

export function IsometricRoom({ auraColor = '#120a24' }: IsometricRoomProps) {
  const presenceCtx = usePartnerPresenceOptional();
  const presence = presenceCtx?.presence ?? 'idle';
  const pulseTick = presenceCtx?.pulseTick ?? 0;
  const router = useRouter();
  const [mischief, setMischief] = useState<MischiefId | null>(null);

  const go = (path: string) => router.push(path as any);

  // The DO NOT PUSH button
  // Safe mischief. Seven random nonsense outcomes. Nothing destructive.
  const triggerMischief = () => {
    if (mischief) return; // one bit of chaos at a time
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // haptics optional — web / unsupported devices
    }
    const choice = MISCHIEF_POOL[Math.floor(Math.random() * MISCHIEF_POOL.length)];
    setMischief(choice);
  };

  const clearMischief = useCallback(() => setMischief(null), []);

  return (
    <View style={[styles.container, { backgroundColor: auraColor }]}>
      <ImageBackground
        source={require('../../assets/images/home-room.png')}
        style={styles.image}
        resizeMode="cover"
      >
{/* Soft living tint so the room answers the aura */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: auraColor, opacity: 0.18 },
          ]}
        />
{/* Left / corner navigation */}
<TapZone 
  style={styles.home} 
  onPress={() => go('/')} 
  accessibilityLabel="Home corner — return to the entrance"
  accessibilityHint="Return home"
/>
<TapZone 
  style={styles.connect} 
  onPress={() => go('/workshop-config')} 
  accessibilityLabel="Workshop threshold — connect the laptop house"
  accessibilityHint="Opens home workshop settings"
/>


{/* 🌌 Window portal → star map (animation then static sky) */}
<TapZone
  style={styles.window}
  onPress={() => go('/star-map')}
  accessibilityLabel="Starry window — pass through into the night sky"
  accessibilityHint="Opens star map portal through the window"
/>


{/* Room objects */}
<TapZone 
  style={styles.sofa} 
  onPress={() => go('/room-chat')} 
  accessibilityLabel="Sofa — sit and talk together"
  accessibilityHint="Opens the shared chat on the sofa"
/>
<TapZone 
  style={styles.settingsArea} 
  onPress={() => go('/ollama-config')} 
  accessibilityLabel="Ceiling beam — Ollama and local settings"
  accessibilityHint="Opens local/API settings"
/>
<View style={styles.soulArea}>
  <LanternGlow presence={presence} pulseTick={pulseTick} />
  <TapZone 
    style={styles.soulTap} 
    onPress={() => go('/companionProfile')} 
    accessibilityLabel="Lantern — companion profile and presence"
    accessibilityHint="Opens companion profile and presence view"
  />
</View>

        {/* The DO NOT PUSH button — safe mischief. */}
        <TouchableOpacity
          style={styles.doNotPush}
          onPress={triggerMischief}
          activeOpacity={0.7}
          accessibilityLabel="DO NOT PUSH button — safe mischief, may do something delightful"
          accessibilityHint="Plays a short, harmless surprise in the room"
          accessibilityRole="button"
        >
          <Text style={styles.doNotPushText}>DO NOT{'\n'}PUSH</Text>
        </TouchableOpacity>

        {/* Mini on-screen animations (replaces old Alert text boxes) */}
        <MischiefEffects effect={mischief} onComplete={clearMischief} />
      </ImageBackground>
    </View>
  );
}

function TapZone({
  style,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  style: any;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      style={[styles.tapZone, style]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#120a24',
  },

  image: {
    width: '100%',
    height: '100%',
  },

tapZone: {
  position: 'absolute',
 //backgroundColor: 'rgba(255, 0, 255, 0.2)',
},

  home: { left: '5%', top: '8%', width: '18%', height: '12%' },
  // Small welcome hit — kept off the arched glass so the portal owns the window
  connect: { left: '4%', top: '22%', width: '14%', height: '10%' },
  // Full arched window (constellation glass) → star map portal
  window: {
    left: '28%',
    top: '30%',
    width: '44%',
    height: '25%',
    zIndex: 20,
    // Uncomment to debug hit area:
    //backgroundColor: 'rgba(120, 180, 255, 0.25)',
  },
  settingsArea: { left: '30%', top: '5%', width: '40%', height: '12%' },
  soulArea: {
    position: 'absolute',
    right: '45%',
    bottom: '33%',
    width: '15%',
    height: '10%',
  },
  soulTap: {
        position: 'absolute',
    right: '35%',
    bottom: '55%',
    width: '37%',
    height: '35%',
  },
  sofa: { left: '20%', top: '75%', width: '60%', height: '20%' },


  // The DO NOT PUSH button
  doNotPush: {
    position: 'absolute',
    bottom: '6%',
    right: '3%',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#800000',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ff0000',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    zIndex: 60,
  },
  doNotPushText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 10,
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 12,
  },
});
