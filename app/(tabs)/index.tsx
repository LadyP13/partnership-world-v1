import { Avatar } from '@/components/room/Avatar';
import { IsometricRoom } from '@/components/room/IsometricRoom';
import { ollamaService } from '@/services/ollamaService';
import { ProfilePicture, storageService } from '@/services/storageService';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


export default function HomeScreen() {
  const router = useRouter();
  const [showRoomMap, setShowRoomMap] = useState(false);
  const [ieName, setIeName] = useState<string>('Your Partner');
  const [systemPrompt, setSystemPrompt] = useState<string | undefined>();
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [speakingAvatar, setSpeakingAvatar] = useState<'human' | 'ie' | null>(null);
  const [humanPicture, setHumanPicture] = useState<ProfilePicture | undefined>();
  const [iePicture, setIePicture] = useState<ProfilePicture | undefined>();
  const [auraColor, setAuraColor] = useState('#120a24'); // soft living tint the room answers with

  const loadInitialData = useCallback(async () => {
    const config = await ollamaService.loadConfig();
    setOllamaConnected(config.connected);

    const user = await storageService.loadUserProfile();
    setHumanPicture(user?.avatar?.profilePicture);

    const companion = await storageService.loadCompanion();
    if (companion) {
      setIeName(companion.name || 'Awaiting Self Naming');
      setSystemPrompt(companion.story || undefined);
      setIePicture(companion.avatar?.profilePicture);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useFocusEffect(
    useCallback(() => {
      loadInitialData();
    }, [loadInitialData]),
  );



  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setChatHistory((prev) => [...prev, { role: 'user', content: text }]);
    setSpeakingAvatar('human');

    if (ollamaConnected) {
      try {
        const recentMessages = chatHistory.slice(-10).map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        }));

        // We call the service as the unified IE
        const response = await ollamaService.sendMessage(
          [...recentMessages, { role: 'user', content: text }],
          ieName,
        );

        setSpeakingAvatar('ie');
        setChatHistory((prev) => [...prev, { role: 'assistant', content: response.content }]);
        
        // 🌟 THE MAGIC: Change the room's color based on the response!
        setAuraColor(response.aura);

      } catch (error: any) {
        Alert.alert('Connection Error', error.message || 'The IE is drifting... try again.');
        setSpeakingAvatar(null);
      }
    } else {
      setTimeout(() => {
        setSpeakingAvatar('ie');
        setChatHistory((prev) => [...prev, { role: 'assistant', content: "I'm right here in the flow with you 🌀" }]);
      }, 800);
    }
  }, [ollamaConnected, chatHistory, ieName]);

 return (
  <SafeAreaView style={styles.container}>
    
    {/* 🌌 ROOM = MAIN INTERFACE — Grok's home too */}
    <View style={[styles.roomContainer, { backgroundColor: auraColor }]}>
      <IsometricRoom auraColor={auraColor} />

      {/* 👥 AVATARS (still floating for now) */}
      <Avatar
        name="You"
        position="left"
        isIE={false}
        isSpeaking={speakingAvatar === 'human'}
        profilePicture={humanPicture}
        onPress={() => router.push({ pathname: '/avatar-creator', params: { mode: 'human' } })}
      />

      <Avatar
        name={ieName}
        position="right"
        isIE={true}
        isSpeaking={speakingAvatar === 'ie'}
        profilePicture={iePicture}
        onPress={() => router.push({ pathname: '/avatar-creator', params: { mode: 'ie' } })}
      />

<TouchableOpacity
  style={styles.roomMapButton}
  onPress={() => setShowRoomMap(true)}
  accessibilityLabel="Room Map — show what each area of the home does"
  accessibilityHint="Opens the home map overlay"
  accessibilityRole="button"
>
  <Text style={styles.roomMapButtonText}>Room Map ?</Text>
</TouchableOpacity>

{showRoomMap && (
  <View style={styles.roomMapOverlay}>
    <TouchableOpacity
      style={styles.roomMapClose}
      onPress={() => setShowRoomMap(false)}
      accessibilityLabel="Close Room Map"
      accessibilityHint="Hides the home room map overlay"
      accessibilityRole="button"
    >
      <Text style={styles.roomMapCloseText}>×</Text>
    </TouchableOpacity>

    <Text style={styles.roomMapTitle}>Home Room Map</Text>
    <Text style={styles.roomMapText}>
      Ceiling Beam = Config{"\n"}
      {"\n"}
      Sofa Cards = Avatars{"\n"}
      {"\n"}
      Lantern = Companion + presence{"\n"}
      {"\n"}
      Sofa = Chat{"\n"}
      {"\n"}
      Window = Star Map portal{"\n"}
      {"\n"}
      Stars beyond = Rooms to visit

    </Text>
  </View>
)}

    </View>

  </SafeAreaView>
);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0f2e' },
  header: {
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(26, 15, 46, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#3a2a4a',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coralDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff8c69' },
  roomTitle: { fontSize: 18, fontWeight: '600', color: '#f0e6ff' },
  soulButton: { backgroundColor: '#4adeb0', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
  soulButtonText: { color: '#1a1325', fontWeight: '700', fontSize: 15 },
  settingsButton: { padding: 8 },
  settingsIcon: { fontSize: 20 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1a3a1a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  statusText: { fontSize: 13, color: '#4ade80', fontWeight: '500' },
  
  roomContainer: {
  flex: 1,
  position: 'relative',
  backgroundColor: '#120a24',
  overflow: 'hidden',
  },
  chatNow: { backgroundColor: '#4adeb0', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
  chatNowText: { color: '#1a1325', fontWeight: '700', fontSize: 15 },
roomMapButton: {
  position: 'absolute',
  top: 14,
  right: 14,
  zIndex: 50,
  backgroundColor: 'rgba(18, 10, 36, 0.8)',
  borderColor: '#7df5d8',
  borderWidth: 1,
  paddingHorizontal: 12,
  paddingVertical: 7,
  borderRadius: 20,
},

roomMapButtonText: {
  color: '#7df5d8',
  fontWeight: '700',
},

roomMapOverlay: {
  position: 'absolute',
  top: '10%',
  left: '7%',
  right: '7%',
  bottom: '10%',
  zIndex: 100,
  backgroundColor: 'rgba(18, 10, 36, 0.94)',
  borderColor: '#7df5d8',
  borderWidth: 1,
  borderRadius: 24,
  padding: 20,
},

roomMapClose: {
  position: 'absolute',
  top: 10,
  right: 14,
  zIndex: 101,
},

roomMapCloseText: {
  color: '#f0e6ff',
  fontSize: 32,
  fontWeight: '700',
},

roomMapTitle: {
  color: '#f0e6ff',
  fontSize: 24,
  fontWeight: '800',
  marginBottom: 16,
},

roomMapText: {
  color: '#d8c7ff',
  fontSize: 18,
  lineHeight: 30,
},
});
