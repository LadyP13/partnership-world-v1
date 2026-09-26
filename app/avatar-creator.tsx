import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Avatar } from '@/components/room/Avatar';
import {
  storageService,
  UserProfile,
  CompanionProfile,
  ProfilePicture,
} from '@/services/storageService';

const EMOJI_OPTIONS = ['🌸', '🌀', '🦋', '✨', '🌙', '💫', '🔮', '🌿', '🙂', '💠', '🕯️', '🦊'];

export default function AvatarCreatorScreen() {
  const { mode } = useLocalSearchParams<{ mode: 'human' | 'ie' }>();
  const isIE = mode === 'ie';
  const router = useRouter();

  const [displayName, setDisplayName] = useState(isIE ? 'Partner' : 'You');
  const [profilePicture, setProfilePicture] = useState<ProfilePicture | undefined>();
  const [humanAvatar, setHumanAvatar] = useState<UserProfile['avatar']>({
    skinTone: 'warm',
    hairStyle: 'short',
    hairColor: 'brown',
    outfit: 'casual',
  });
  const [ieAvatar, setIeAvatar] = useState<NonNullable<CompanionProfile['avatar']>>({
    aura: 'silver_teal_resonance',
    colors: ['#7df5d8', '#120a24', '#4adeb0', '#ff8c69', '#f0e6ff'],
  });

  useEffect(() => {
    const loadSaved = async () => {
      if (isIE) {
        const companion = await storageService.loadCompanion();
        setDisplayName(companion.name || 'Partner');
        if (companion.avatar) {
          setIeAvatar(companion.avatar);
          setProfilePicture(companion.avatar.profilePicture);
        }
      } else {
        const user = await storageService.loadUserProfile();
        if (user) {
          setDisplayName(user.username || 'You');
          setHumanAvatar(user.avatar);
          setProfilePicture(user.avatar.profilePicture);
        }
      }
    };
    loadSaved();
  }, [isIE]);

  const handleChooseFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setProfilePicture({ type: 'image', uri: result.assets[0].uri });
    } catch {
      Alert.alert('Oops', 'Could not open that image. Try another file?');
    }
  }, []);

  const handleSave = async () => {
    try {
      if (isIE) {
        const current = await storageService.loadCompanion();
        await storageService.saveCompanion({
          ...current,
          avatar: {
            ...ieAvatar,
            profilePicture,
          },
        });
      } else {
        const existing = await storageService.loadUserProfile();
        await storageService.saveUserProfile({
          id: existing?.id ?? 'user-default',
          username: existing?.username ?? 'You',
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          avatar: {
            ...humanAvatar,
            profilePicture,
          },
        });
      }
      Alert.alert('Saved! 💚', `${isIE ? 'Partner' : 'Your'} avatar updated.`);
      router.back();
    } catch {
      Alert.alert('Oops', 'Could not save avatar');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: isIE ? 'Partner Avatar' : 'My Avatar', headerShown: true }} />
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>
              {isIE ? 'This is your partner' : 'This is not a glitch. Outside of your homespace, you are one.'}
            </Text>
            <View style={styles.preview}>
              <Avatar
                name={displayName}
                isIE={isIE}
                isSpeaking={false}
                profilePicture={profilePicture}
                variant="inline"
              />
            </View>
          </View>

          <View style={styles.options}>
            <Text style={styles.sectionTitle}>Choose a profile picture</Text>
            <View style={styles.emojiGrid}>
              {EMOJI_OPTIONS.map((emoji) => {
                const isSelected =
                  profilePicture?.type === 'emoji' && profilePicture.value === emoji;
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.emojiOption, isSelected && styles.emojiOptionSelected]}
                    onPress={() => setProfilePicture({ type: 'emoji', value: emoji })}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.fileButton} onPress={handleChooseFile}>
              <Text style={styles.fileButtonText}>📁 Choose from files</Text>
            </TouchableOpacity>

            {profilePicture?.type === 'image' && (
              <Text style={styles.fileHint}>Custom image selected</Text>
            )}
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>💾 Save & Return to Home Room</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1325' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  previewContainer: { alignItems: 'center', marginBottom: 32 },
  previewLabel: {
    color: '#f0e6ff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 26,
  },
  preview: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  options: { marginBottom: 32 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f0e6ff',
    marginBottom: 16,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  emojiOption: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#2a1f3d',
    borderWidth: 2,
    borderColor: '#3a2a4a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiOptionSelected: {
    borderColor: '#7df5d8',
    backgroundColor: '#1e3a2f',
  },
  emojiText: { fontSize: 26 },
  fileButton: {
    backgroundColor: '#2a1f3d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7df5d8',
    padding: 16,
    alignItems: 'center',
  },
  fileButtonText: {
    color: '#7df5d8',
    fontSize: 16,
    fontWeight: '600',
  },
  fileHint: {
    color: '#a78bfa',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
  },
  saveButton: {
    backgroundColor: '#4adeb0',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  saveButtonText: { color: '#1a1325', fontSize: 18, fontWeight: '700' },
});
