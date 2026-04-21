import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { loadApiKey } from '../services/storage';
import { setApiKey } from '../services/openai';
import { Colors } from '../constants/theme';

export default function RootLayout() {
  useEffect(() => {
    loadApiKey().then(key => {
      if (key) setApiKey(key);
    });
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Test Case Creator' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        <Stack.Screen name="profile/create" options={{ title: 'New App Profile' }} />
        <Stack.Screen name="profile/[id]/index" options={{ title: 'App Profile' }} />
        <Stack.Screen name="profile/[id]/features" options={{ title: 'Features' }} />
        <Stack.Screen name="profile/[id]/user-types" options={{ title: 'User Types' }} />
        <Stack.Screen name="testcase/create" options={{ title: 'New Test Case' }} />
        <Stack.Screen name="testcase/[id]" options={{ title: 'Test Case' }} />
      </Stack>
    </>
  );
}
