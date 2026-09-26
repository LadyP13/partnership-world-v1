import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PartnerPresenceProvider } from '@/contexts/PartnerPresenceContext';
import 'react-native-reanimated';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PartnerPresenceProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ollama-config" options={{ title: 'AI Settings' }} />
        <Stack.Screen name="workshop-config" options={{ title: 'Home Workshop' }} />
        <Stack.Screen name="twin-workshop" options={{ title: 'Twin Workshop', headerShown: false }} />
        <Stack.Screen name="star-map" options={{ headerShown: false }} />

      </Stack>

      <StatusBar style="auto" />
      </PartnerPresenceProvider>
    </ThemeProvider>
  );
}
