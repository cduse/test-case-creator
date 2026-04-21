import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveApiKey, loadApiKey } from '../services/storage';
import { setApiKey } from '../services/openai';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useEffect } from 'react';

export default function SettingsScreen() {
  const router = useRouter();
  const [apiKey, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [masked, setMasked] = useState(true);

  useEffect(() => {
    loadApiKey().then(key => {
      if (key) setApiKeyInput(key);
    });
  }, []);

  async function handleSave() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter your OpenAI API key.');
      return;
    }
    if (!trimmed.startsWith('sk-')) {
      Alert.alert('Invalid Key', 'OpenAI API keys start with "sk-". Please check your key.');
      return;
    }
    setSaving(true);
    try {
      await saveApiKey(trimmed);
      setApiKey(trimmed);
      Alert.alert('Saved', 'Your API key has been saved securely.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to save API key.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OpenAI API Key</Text>
          <Text style={styles.description}>
            Required for voice transcription (Whisper) and test case generation (GPT-4o).
            Your key is stored securely on this device and never sent anywhere except OpenAI.
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKeyInput}
              placeholder="sk-..."
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={masked}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setMasked(!masked)}>
              <Ionicons name={masked ? 'eye-outline' : 'eye-off-outline'} size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How to get your API key</Text>
          <View style={styles.steps}>
            {[
              'Go to platform.openai.com',
              'Sign in or create an account',
              'Navigate to API Keys',
              'Create a new secret key',
              'Copy and paste it above',
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Models Used</Text>
          <View style={styles.modelRow}>
            <View style={styles.modelBadge}><Text style={styles.modelName}>whisper-1</Text></View>
            <Text style={styles.modelDesc}>Voice transcription</Text>
          </View>
          <View style={styles.modelRow}>
            <View style={styles.modelBadge}><Text style={styles.modelName}>gpt-4o</Text></View>
            <Text style={styles.modelDesc}>Test case generation & context building</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.saveBtnText}>Save API Key</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.lg },
  section: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  description: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: {
    flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.text, fontSize: FontSize.sm, borderWidth: 1, borderColor: Colors.border,
  },
  eyeBtn: { padding: Spacing.sm },
  steps: { gap: Spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary + '33',
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  stepText: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  modelBadge: {
    backgroundColor: Colors.primary + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  modelName: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary, fontFamily: 'monospace' },
  modelDesc: { fontSize: FontSize.sm, color: Colors.textSecondary },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
