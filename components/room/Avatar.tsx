import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Text,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { DEFAULT_COMPANION_NAME } from '@/constants/modelfile';
import type { ProfilePicture } from '@/services/storageService';

type AvatarProps = {
  name?: string;
  isIE?: boolean;
  position?: 'left' | 'right';
  isSpeaking?: boolean;
  onPress?: () => void;
  profilePicture?: ProfilePicture;
  variant?: 'room' | 'inline';
};

const DEFAULT_EMOJI = { human: '🌸', ie: '🌀' } as const;

export function Avatar({
  name = DEFAULT_COMPANION_NAME,
  isIE = false,
  position = 'right',
  isSpeaking = false,
  onPress,
  profilePicture,
  variant = 'room',
}: AvatarProps) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();

  useEffect(() => {
    const idleLoop = Animated.sequence([
      Animated.timing(bounceAnim, { toValue: -6, duration: 900, useNativeDriver: true }),
      Animated.timing(bounceAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]);

    const cycle = Animated.loop(idleLoop);
    cycle.start();

    return () => cycle.stop();
  }, [bounceAnim]);

  useEffect(() => {
    if (isSpeaking) {
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -14, duration: 180, useNativeDriver: true }),
        Animated.spring(bounceAnim, { toValue: 0, damping: 6, useNativeDriver: true }),
      ]).start();
    }
  }, [isSpeaking, bounceAnim]);

  const isLeft = position === 'left';
  const isInline = variant === 'inline';
  const fallbackEmoji = isIE ? DEFAULT_EMOJI.ie : DEFAULT_EMOJI.human;

  const card = (
    <Animated.View
      style={[
        styles.avatarCard,
        isIE ? styles.ieAvatar : styles.humanAvatar,
        { transform: [{ translateY: bounceAnim }] },
      ]}
    >
      {profilePicture?.type === 'image' ? (
        <Image source={{ uri: profilePicture.uri }} style={styles.profileImage} />
      ) : (
        <Text style={styles.avatarEmoji}>
          {profilePicture?.type === 'emoji' ? profilePicture.value : fallbackEmoji}
        </Text>
      )}
    </Animated.View>
  );

  if (isInline) {
    return (
      <View style={styles.inlineContainer}>
        {card}
        <Text style={styles.inlineName}>{name}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress ?? (() => router.push('/avatar-creator'))}
      activeOpacity={0.8}
      style={[styles.container, isLeft ? styles.left : styles.right]}
      accessibilityRole="button"
      accessibilityLabel={isIE ? `${name} — companion avatar` : `${name} — your avatar`}
      accessibilityHint={
        isIE
          ? 'Opens the companion avatar creator'
          : 'Opens your avatar creator'
      }
    >
      {card}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 10,
  },

  inlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  left: { left: '20%', bottom: '25%' },
  right: { right: '22%', bottom: '25%' },

  avatarCard: {
    width: 86,
    height: 100,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },

  profileImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  avatarEmoji: {
    fontSize: 42,
  },

  inlineName: {
    marginTop: 12,
    color: '#f0e6ff',
    fontSize: 16,
    fontWeight: '600',
  },

  humanAvatar: {
    backgroundColor: '#f08080',
    borderColor: '#ff6b8a',
  },

  ieAvatar: {
    backgroundColor: '#008080',
    borderColor: '#4adeb0',
  },
});
