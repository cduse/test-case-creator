import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { getTestCase, getProfile, deleteTestCase, formatTestCasesAsText } from '../../services/storage';
import { TestCase, AppProfile } from '../../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

function StepRow({ step }: { step: { order: number; action: string; expectedResult: string } }) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepHeader}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{step.order}</Text>
        </View>
        <Text style={styles.stepAction}>{step.action}</Text>
      </View>
      {step.expectedResult ? (
        <View style={styles.expectedRow}>
          <Text style={styles.expectedLabel}>Expected: </Text>
          <Text style={styles.expectedText}>{step.expectedResult}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TestCaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    getTestCase(id).then(tc => {
      setTestCase(tc);
      if (tc) getProfile(tc.appProfileId).then(setProfile);
    });
  }, [id]);

  async function handleCopy() {
    if (!testCase || !profile) return;
    const text = formatTestCasesAsText([testCase], profile.name);
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!testCase || !profile) return;
    const text = formatTestCasesAsText([testCase], profile.name);
    await Share.share({ message: text, title: testCase.title });
  }

  async function handleDelete() {
    if (!testCase) return;
    Alert.alert('Delete', `Delete "${testCase.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteTestCase(testCase.id);
          router.back();
        },
      },
    ]);
  }

  if (!testCase) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{testCase.title}</Text>
          <View style={styles.tags}>
            {testCase.userType && <Tag label={testCase.userType} color={Colors.primary} />}
            {testCase.feature && <Tag label={testCase.feature} color={Colors.secondary} />}
            {testCase.tags.filter(t => t !== testCase.userType && t !== testCase.feature).map(t => (
              <Tag key={t} label={t} color={Colors.warning} />
            ))}
          </View>
          {profile && (
            <TouchableOpacity onPress={() => router.push(`/profile/${profile.id}`)}>
              <Text style={styles.profileLink}>{profile.name} ↗</Text>
            </TouchableOpacity>
          )}
        </View>

        {testCase.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.bodyText}>{testCase.description}</Text>
          </View>
        ) : null}

        {testCase.preconditions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Preconditions</Text>
            {testCase.preconditions.map((p, i) => (
              <View key={i} style={styles.precondRow}>
                <Text style={styles.precondBullet}>•</Text>
                <Text style={styles.bodyText}>{p}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Steps ({testCase.steps.length})</Text>
          {testCase.steps.map(step => <StepRow key={step.order} step={step} />)}
        </View>

        {testCase.expectedResult && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Overall Expected Result</Text>
            <View style={styles.expectedResult}>
              <Text style={styles.expectedResultText}>{testCase.expectedResult}</Text>
            </View>
          </View>
        )}

        {testCase.voiceInput && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Original Voice Input</Text>
            <Text style={[styles.bodyText, styles.voiceInput]}>"{testCase.voiceInput}"</Text>
          </View>
        )}

        <Text style={styles.createdAt}>Created {new Date(testCase.createdAt).toLocaleDateString()}</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
            <Text style={styles.actionBtnText}>{copied ? '✓ Copied' : '📋 Copy'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Text style={styles.actionBtnText}>📤 Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
            <Text style={[styles.actionBtnText, styles.deleteBtnText]}>🗑️ Delete</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  header: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, lineHeight: 28 },
  tags: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  tag: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  tagText: { fontSize: FontSize.xs, fontWeight: '600' },
  profileLink: { fontSize: FontSize.sm, color: Colors.textSecondary },
  section: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  bodyText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 22 },
  precondRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  precondBullet: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
  stepCard: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  stepBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  stepBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.white },
  stepAction: { flex: 1, fontSize: FontSize.sm, color: Colors.text, lineHeight: 22 },
  expectedRow: { flexDirection: 'row', paddingLeft: 34, flexWrap: 'wrap' },
  expectedLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.secondary },
  expectedText: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1, lineHeight: 20 },
  expectedResult: {
    backgroundColor: Colors.secondary + '11', borderRadius: BorderRadius.sm,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.secondary + '33',
  },
  expectedResultText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 22 },
  voiceInput: { color: Colors.textSecondary, fontStyle: 'italic' },
  createdAt: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  deleteBtn: { borderColor: Colors.danger + '44', backgroundColor: Colors.danger + '11' },
  deleteBtnText: { color: Colors.danger },
});
