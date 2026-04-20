import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getProfile, saveTestCase } from '../../services/storage';
import { transcribeAudio, generateTestCase, hasApiKey } from '../../services/openai';
import { AppProfile, GeneratedTestCase, TestCase } from '../../types';
import { generateId } from '../../utils/id';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import VoiceRecorder from '../../components/VoiceRecorder';

type Phase = 'record' | 'transcribing' | 'review' | 'generating' | 'edit';

export default function CreateTestCaseScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [phase, setPhase] = useState<Phase>('record');
  const [transcript, setTranscript] = useState('');
  const [generated, setGenerated] = useState<GeneratedTestCase | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profileId) {
      getProfile(profileId).then(p => setProfile(p));
    }
  }, [profileId]);

  useEffect(() => {
    if (!hasApiKey()) {
      Alert.alert(
        'API Key Required',
        'Please configure your OpenAI API key in Settings first.',
        [
          { text: 'Go to Settings', onPress: () => router.push('/settings') },
          { text: 'Cancel', onPress: () => router.back(), style: 'cancel' },
        ]
      );
    }
  }, []);

  async function handleRecordingComplete(uri: string) {
    setPhase('transcribing');
    try {
      const text = await transcribeAudio(uri);
      setTranscript(text);
      setPhase('review');
    } catch (e: any) {
      Alert.alert('Transcription Failed', e.message);
      setPhase('record');
    }
  }

  async function handleGenerate() {
    if (!profile || !transcript.trim()) return;
    setPhase('generating');
    try {
      const result = await generateTestCase(transcript, profile);
      setGenerated(result);
      setPhase('edit');
    } catch (e: any) {
      Alert.alert('Generation Failed', e.message);
      setPhase('review');
    }
  }

  async function handleSave() {
    if (!generated || !profileId) return;
    setSaving(true);
    try {
      const testCase: TestCase = {
        id: generateId(),
        appProfileId: profileId,
        voiceInput: transcript,
        createdAt: new Date().toISOString(),
        ...generated,
      };
      await saveTestCase(testCase);
      router.replace(`/testcase/${testCase.id}`);
    } catch (e: any) {
      Alert.alert('Save Failed', e.message);
      setSaving(false);
    }
  }

  function handleRetry() {
    setTranscript('');
    setGenerated(null);
    setPhase('record');
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.profileBadge}>
            <Text style={styles.profileBadgeLabel}>Creating test case for</Text>
            <Text style={styles.profileBadgeName}>{profile.name}</Text>
          </View>

          {(phase === 'record') && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Describe the Test Case</Text>
              <Text style={styles.cardSubtitle}>
                Speak naturally. Reference user types and features by name.
                Example: "Buying airtime for a prestige user"
              </Text>
              <VoiceRecorder onTranscriptionComplete={handleRecordingComplete} />
              <View style={styles.divider}><Text style={styles.dividerText}>or type it instead</Text></View>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={transcript}
                onChangeText={setTranscript}
                placeholder="Type your test case description here..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
              />
              {transcript.trim().length > 0 && (
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setPhase('review')}>
                  <Text style={styles.primaryBtnText}>Continue →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {phase === 'transcribing' && (
            <View style={styles.card}>
              <View style={styles.loadingState}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.loadingTitle}>Transcribing...</Text>
                <Text style={styles.loadingSubtitle}>Converting your voice to text</Text>
              </View>
            </View>
          )}

          {phase === 'review' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Review Transcript</Text>
              <Text style={styles.cardSubtitle}>
                Edit the text if needed, then generate the test case.
              </Text>
              <TextInput
                style={[styles.input, styles.textArea, styles.transcriptInput]}
                value={transcript}
                onChangeText={setTranscript}
                multiline
                numberOfLines={5}
                autoFocus
              />
              <View style={styles.row}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleRetry}>
                  <Text style={styles.secondaryBtnText}>↩ Re-record</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleGenerate}>
                  <Text style={styles.primaryBtnText}>✨ Generate Test Case</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {phase === 'generating' && (
            <View style={styles.card}>
              <View style={styles.loadingState}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.loadingTitle}>Generating Test Case...</Text>
                <Text style={styles.loadingSubtitle}>
                  GPT-4o is analyzing your input with {profile.name}'s context
                </Text>
              </View>
            </View>
          )}

          {phase === 'edit' && generated && (
            <GeneratedPreview
              generated={generated}
              onChange={setGenerated}
              transcript={transcript}
              onRetry={handleRetry}
              onSave={handleSave}
              saving={saving}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function GeneratedPreview({ generated, onChange, transcript, onRetry, onSave, saving }: {
  generated: GeneratedTestCase;
  onChange: (g: GeneratedTestCase) => void;
  transcript: string;
  onRetry: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <>
      <View style={styles.card}>
        <View style={styles.generatedHeader}>
          <Text style={styles.generatedBadge}>✨ Generated</Text>
          <TouchableOpacity onPress={onRetry}>
            <Text style={styles.retryLink}>Start over</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.cardSubtitle}>From: "{transcript}"</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          style={styles.input}
          value={generated.title}
          onChangeText={v => onChange({ ...generated, title: v })}
        />
        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={generated.description}
          onChangeText={v => onChange({ ...generated, description: v })}
          multiline
          numberOfLines={3}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>User Type</Text>
            <TextInput
              style={styles.input}
              value={generated.userType ?? ''}
              onChangeText={v => onChange({ ...generated, userType: v || undefined })}
              placeholder="e.g. Prestige User"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Feature</Text>
            <TextInput
              style={styles.input}
              value={generated.feature}
              onChangeText={v => onChange({ ...generated, feature: v })}
              placeholder="e.g. Buy Airtime"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>
      </View>

      {generated.preconditions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preconditions</Text>
          {generated.preconditions.map((p, i) => (
            <View key={i} style={styles.preconditionRow}>
              <Text style={styles.bullet}>•</Text>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={p}
                onChangeText={v => {
                  const updated = [...generated.preconditions];
                  updated[i] = v;
                  onChange({ ...generated, preconditions: updated });
                }}
                multiline
              />
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Steps ({generated.steps.length})</Text>
        {generated.steps.map((step, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{step.order}</Text></View>
              <Text style={styles.stepLabel}>Action</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={step.action}
              onChangeText={v => {
                const updated = [...generated.steps];
                updated[i] = { ...step, action: v };
                onChange({ ...generated, steps: updated });
              }}
              multiline
              numberOfLines={2}
            />
            <Text style={styles.stepLabel}>Expected Result</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={step.expectedResult}
              onChangeText={v => {
                const updated = [...generated.steps];
                updated[i] = { ...step, expectedResult: v };
                onChange({ ...generated, steps: updated });
              }}
              multiline
              numberOfLines={2}
            />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Overall Expected Result</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={generated.expectedResult}
          onChangeText={v => onChange({ ...generated, expectedResult: v })}
          multiline
          numberOfLines={3}
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
        {saving
          ? <ActivityIndicator color={Colors.white} />
          : <Text style={styles.saveBtnText}>Save Test Case</Text>}
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  profileBadge: {
    backgroundColor: Colors.primary + '11', borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33',
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  profileBadgeLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  profileBadgeName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm,
  },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  cardSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  input: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.text, fontSize: FontSize.sm, borderWidth: 1, borderColor: Colors.border,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top', paddingTop: Spacing.sm },
  transcriptInput: { fontSize: FontSize.md, lineHeight: 24, minHeight: 100 },
  divider: { alignItems: 'center', paddingVertical: Spacing.sm },
  dividerText: { fontSize: FontSize.xs, color: Colors.textMuted },
  row: { flexDirection: 'row', gap: Spacing.sm },
  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
  secondaryBtn: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  secondaryBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
  loadingState: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  loadingTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  loadingSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  generatedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  generatedBadge: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.secondary },
  retryLink: { fontSize: FontSize.sm, color: Colors.textSecondary },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  preconditionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bullet: { fontSize: FontSize.md, color: Colors.textSecondary },
  stepCard: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.white },
  stepLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  saveBtn: {
    backgroundColor: Colors.secondary, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
