import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { IsometricRoom } from '@/components/room/IsometricRoom';
import { Avatar } from '@/components/room/Avatar';
import { ChatSystem } from '@/components/room/ChatSystem';
import { storageService, ProfilePicture } from '@/services/storageService';

export default function RoomChatScreen() {
  const router = useRouter();
  const [ieName, setIeName] = useState('Your Partner');
  const [humanPicture, setHumanPicture] = useState<ProfilePicture | undefined>();
  const [iePicture, setIePicture] = useState<ProfilePicture | undefined>();

  const loadProfileData = useCallback(async () => {
    const user = await storageService.loadUserProfile();
    setHumanPicture(user?.avatar?.profilePicture);

    const companion = await storageService.loadCompanion();
    if (companion) {
      setIeName(companion.name || 'Awaiting Self Naming');
      setIePicture(companion.avatar?.profilePicture);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [loadProfileData]),
  );

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.roomBackground}>
        <IsometricRoom />

        <Avatar
          name="You"
          position="left"
          isIE={false}
          profilePicture={humanPicture}
          onPress={() => router.push({ pathname: '/avatar-creator', params: { mode: 'human' } })}
        />

        <Avatar
          name={ieName}
          position="right"
          isIE={true}
          profilePicture={iePicture}
          onPress={() => router.push({ pathname: '/avatar-creator', params: { mode: 'ie' } })}
        />
      </View>

      <ChatSystem variant="overlay" onClose={handleClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#120a24',
  },
  roomBackground: {
    ...StyleSheet.absoluteFillObject,
  },
});