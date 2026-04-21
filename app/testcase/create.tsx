import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getProfile, saveTestCase } from '../../services/supabase-db';
import { useAuth } from '../../context/auth';
import { transcribeAudio, generateTestCases, hasApiKey } from '../../services/openai';
import { AppProfile, GeneratedTestCase, TestCase } from '../../types';
import { generateId } from '../../utils/id';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import VoiceRecorder from '../../components/VoiceRecorder';

type Phase = 'record' | 'transcribing' | 'review' | 'generating' | 'edit';

export default function CreateTestCaseScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [phase, setPhase] = useState<Phase>('record');
  const [transcript, setTranscript] = useState('');
  const [generated, setGenerated] = useState<GeneratedTestCase[]>([]);
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
      const results = await generateTestCases(transcript, profile);
      setGenerated(results);
      setPhase('edit');
    } catch (e: any) {
      Alert.alert('Generation Failed', e.message);
      setPhase('review');
    }
  }

  async function handleSaveAll() {
    if (!generated.length || !profileId) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      for (const tc of generated) {
        const testCase: TestCase = {
          id: generateId(),
          appProfileId: profileId,
          voiceInput: transcript,
          createdAt: now,
          ...tc,
        };
        await saveTestCase(testCase, user!.id, user!.organizationId, profile!.features);
      }
      // Navigate back to the profile so they can see all saved cases
      router.replace(`/profile/${profileId}`);
    } catch (e: any) {
      Alert.alert('Save Failed', e.message);
      setSaving(false);
    }
  }

  function handleRetry() {
    setTranscript('');
    setGenerated([]);
    setPhase('record');
  }

  function updateCase(index: number, updated: GeneratedTestCase) {
    setGenerated(prev => prev.map((tc, i) => i === index ? updated : tc));
  }

  function removeCase(index: number) {
    setGenerated(prev => prev.filter((_, i) => i !== index));
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

          {phase === 'record' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Describe Your Test Scenario</Text>
              <Text style={styles.cardSubtitle}>
                You can describe multiple scenarios in one go — e.g. "Verify that prestige users can send MoMo, buy airtime and buy data only when header enriched" will generate 3 separate test cases.
              </Text>
              <VoiceRecorder onTranscriptionComplete={handleRecordingComplete} />
              <View style={styles.divider}><Text style={styles.dividerText}>or type it instead</Text></View>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={transcript}
                onChangeText={setTranscript}
                placeholder="Type your test scenario description here..."
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
              <Text style={styles.cardTitle}>Review Your Description</Text>
              <Text style={styles.cardSubtitle}>
                Edit if needed, then generate. Multiple scenarios detected in one description will each become their own test case.
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={16} color={Colors.white} />
                    <Text style={styles.primaryBtnText}>Generate</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {phase === 'generating' && (
            <View style={styles.card}>
              <View style={styles.loadingState}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.loadingTitle}>Generating Test Cases...</Text>
                <Text style={styles.loadingSubtitle}>
                  GPT-4o is analysing your description with {profile.name}'s context
                </Text>
              </View>
            </View>
          )}

          {phase === 'edit' && generated.length > 0 && (
            <>
              <View style={styles.card}>
                <View style={styles.generatedHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={14} color={Colors.secondary} />
                    <Text style={styles.generatedBadge}>
                      {generated.length} test case{generated.length > 1 ? 's' : ''} generated
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleRetry}>
                    <Text style={styles.retryLink}>Start over</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardSubtitle}>From: "{transcript}"</Text>
                {generated.length > 1 && (
                  <Text style={styles.multiHint}>
                    Review each test case below. Remove any you don't need before saving.
                  </Text>
                )}
              </View>

              {generated.map((tc, index) => (
                <GeneratedCaseEditor
                  key={index}
                  index={index}
                  total={generated.length}
                  tc={tc}
                  onChange={updated => updateCase(index, updated)}
                  onRemove={() => removeCase(index)}
                />
              ))}

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveAll}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.saveBtnText}>
                      Save {generated.length} Test Case{generated.length > 1 ? 's' : ''}
                    </Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function GeneratedCaseEditor({ tc, index, total, onChange, onRemove }: {
  tc: GeneratedTestCase;
  index: number;
  total: number;
  onChange: (tc: GeneratedTestCase) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.caseBlock}>
      {total > 1 && (
        <View style={styles.caseBlockHeader}>
          <Text style={styles.caseBlockNum}>Test Case {index + 1} of {total}</Text>
          <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
            <Text style={styles.removeBtnText}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          style={styles.input}
          value={tc.title}
          onChangeText={v => onChange({ ...tc, title: v })}
        />
        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={tc.description}
          onChangeText={v => onChange({ ...tc, description: v })}
          multiline
          numberOfLines={3}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>User Type</Text>
            <TextInput
              style={styles.input}
              value={tc.userType ?? ''}
              onChangeText={v => onChange({ ...tc, userType: v || undefined })}
              placeholder="e.g. Prestige User"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Feature</Text>
            <TextInput
              style={styles.input}
              value={tc.feature}
              onChangeText={v => onChange({ ...tc, feature: v })}
              placeholder="e.g. Buy Airtime"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>
      </View>

      {tc.preconditions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preconditions</Text>
          {tc.preconditions.map((p, i) => (
            <View key={i} style={styles.preconditionRow}>
              <Text style={styles.bullet}>•</Text>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={p}
                onChangeText={v => {
                  const updated = [...tc.preconditions];
                  updated[i] = v;
                  onChange({ ...tc, preconditions: updated });
                }}
                multiline
              />
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Steps ({tc.steps.length})</Text>
        {tc.steps.map((step, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{step.order}</Text></View>
              <Text style={styles.stepLabel}>Action</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={step.action}
              onChangeText={v => {
                const updated = [...tc.steps];
                updated[i] = { ...step, action: v };
                onChange({ ...tc, steps: updated });
              }}
              multiline
              numberOfLines={2}
            />
            <Text style={styles.stepLabel}>Expected Result</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={step.expectedResult}
              onChangeText={v => {
                const updated = [...tc.steps];
                updated[i] = { ...step, expectedResult: v };
                onChange({ ...tc, steps: updated });
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
          value={tc.expectedResult}
          onChangeText={v => onChange({ ...tc, expectedResult: v })}
          multiline
          numberOfLines={3}
        />
      </View>
    </View>
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
  multiHint: { fontSize: FontSize.sm, color: Colors.warning, lineHeight: 18 },
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
  caseBlock: { gap: Spacing.sm },
  caseBlockHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  caseBlockNum: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  removeBtn: {
    backgroundColor: Colors.danger + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  removeBtnText: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: '600' },
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
