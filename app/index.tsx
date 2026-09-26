import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';
import { ollamaService } from '@/services/ollamaService';
import { storageService } from '@/services/storageService';
import { workshopService } from '@/services/workshopService';

const MIN_SPLASH_MS = 1800;

export default function SplashScreenRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      const minDelay = new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS));

      await Promise.all([
        ollamaService.loadConfig(),
        storageService.loadCompanion(),
        workshopService.loadConfig(),
        minDelay,
      ]);

      if (workshopService.isLoggedIn()) {
        workshopService.connectWebSocket();
      }

      if (!cancelled) {
        // Don't steal a cold-start deep link (room-builder, star-map, …)
        const webPath =
          Platform.OS === 'web' && typeof window !== 'undefined'
            ? window.location.pathname
            : pathname;
        if (webPath === '/' || webPath === '/index' || webPath === '') {
          router.replace('/(tabs)');
        }
      }
    }

    prepare();

    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  const handleImageLoad = async () => {
    if (!nativeSplashHidden) {
      await SplashScreen.hideAsync();
      setNativeSplashHidden(true);
    }
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('@/assets/images/splash-screen.png')}
        style={styles.image}
        resizeMode="cover"
        onLoadEnd={handleImageLoad}
      >
        <View style={styles.footer}>
          <ActivityIndicator size="small" color="#7df5d8" />
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});