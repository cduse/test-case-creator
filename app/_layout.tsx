import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { loadApiKey } from '../services/storage';
import { setApiKey } from '../services/openai';
import { Colors } from '../constants/theme';
import { AuthProvider, useAuth } from '../context/auth';

function NavigationGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'login';
    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ title: 'Testify' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
      <Stack.Screen name="profile/create" options={{ title: 'New Product' }} />
      <Stack.Screen name="profile/[id]/index" options={{ title: 'Product' }} />
      <Stack.Screen name="profile/[id]/features" options={{ title: 'Features' }} />
      <Stack.Screen name="profile/[id]/user-types" options={{ title: 'User Types' }} />
      <Stack.Screen name="testcase/create" options={{ title: 'New Test Case' }} />
      <Stack.Screen name="testcase/[id]" options={{ title: 'Test Case' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    loadApiKey().then(key => {
      if (key) setApiKey(key);
    });
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <NavigationGate />
    </AuthProvider>
  );
}
