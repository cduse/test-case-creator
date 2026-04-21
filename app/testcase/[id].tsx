import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getTestCase, getProfile, deleteTestCase, formatTestCasesAsText, buildAutomationExport } from '../../services/storage';
import { TestCase, AppProfile, Priority, TestType } from '../../types';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#6366F1',
  low: '#94A3B8',
};

const TYPE_COLOR: Record<TestType, string> = {
  regression: '#10B981',
  smoke: '#F59E0B',
  sanity: '#6366F1',
  functional: '#3B82F6',
  negative: '#EF4444',
};

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

function StepRow({ step }: { step: TestCase['steps'][number] }) {
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
      {step.automationHint ? (
        <View style={styles.hintRow}>
          <Text style={styles.hintLabel}>🤖 Hint: </Text>
          <Text style={styles.hintText}>{step.automationHint}</Text>
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

  async function handleExportJson() {
    if (!testCase || !profile) return;
    try {
      const payload = buildAutomationExport(profile, [testCase]);
      const json = JSON.stringify(payload, null, 2);
      const fileName = `${testCase.title.replace(/\s+/g, '_').substring(0, 40)}.json`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Export Test Case' });
      } else {
        Alert.alert('Sharing not available', 'Cannot share files on this device.');
      }
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    }
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

  const priority = testCase.priority ?? 'medium';
  const testType = testCase.testType ?? 'regression';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{testCase.title}</Text>
          <View style={styles.tags}>
            <Tag label={priority.toUpperCase()} color={PRIORITY_COLOR[priority]} />
            <Tag label={testType} color={TYPE_COLOR[testType]} />
            {testCase.userType && <Tag label={testCase.userType} color={Colors.primary} />}
            {testCase.feature && <Tag label={testCase.feature} color={Colors.secondary} />}
            {testCase.tags
              .filter(t => t !== testCase.userType && t !== testCase.feature)
              .map(t => <Tag key={t} label={t} color={Colors.warning} />)}
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

        {testCase.expectedResult ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Overall Expected Result</Text>
            <View style={styles.expectedResult}>
              <Text style={styles.expectedResultText}>{testCase.expectedResult}</Text>
            </View>
          </View>
        ) : null}

        {testCase.dataRequirements && testCase.dataRequirements.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Data Requirements</Text>
            {testCase.dataRequirements.map((req, i) => (
              <View key={i} style={styles.dataReqCard}>
                <View style={styles.dataReqHeader}>
                  <View style={styles.dataReqTypeBadge}>
                    <Text style={styles.dataReqType}>{req.type}</Text>
                  </View>
                  <Text style={styles.dataReqDesc}>{req.description}</Text>
                </View>
                {req.example ? (
                  <Text style={styles.dataReqExample}>e.g. {req.example}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {testCase.voiceInput ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Original Voice Input</Text>
            <Text style={[styles.bodyText, styles.voiceInput]}>"{testCase.voiceInput}"</Text>
          </View>
        ) : null}

        <Text style={styles.createdAt}>Created {new Date(testCase.createdAt).toLocaleDateString()}</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={Colors.secondary} />
            <Text style={styles.actionBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Ionicons name="document-text-outline" size={16} color={Colors.secondary} />
            <Text style={styles.actionBtnText}>Text</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleExportJson}>
            <Ionicons name="download-outline" size={16} color={Colors.secondary} />
            <Text style={styles.actionBtnText}>JSON</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
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
  hintRow: { flexDirection: 'row', paddingLeft: 34, flexWrap: 'wrap' },
  hintLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primary },
  hintText: { fontSize: FontSize.xs, color: Colors.textMuted, flex: 1, lineHeight: 18, fontFamily: 'monospace' },
  expectedResult: {
    backgroundColor: Colors.secondary + '11', borderRadius: BorderRadius.sm,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.secondary + '33',
  },
  expectedResultText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 22 },
  dataReqCard: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, gap: 4, borderWidth: 1, borderColor: Colors.border,
  },
  dataReqHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  dataReqTypeBadge: {
    backgroundColor: Colors.warning + '22', borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  dataReqType: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.warning, textTransform: 'uppercase' },
  dataReqDesc: { fontSize: FontSize.sm, color: Colors.text, flex: 1 },
  dataReqExample: { fontSize: FontSize.xs, color: Colors.textMuted, paddingLeft: 4, fontStyle: 'italic' },
  voiceInput: { color: Colors.textSecondary, fontStyle: 'italic' },
  createdAt: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', gap: 6,
  },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  deleteBtn: { borderColor: Colors.danger + '44', backgroundColor: Colors.danger + '11', flex: 0, paddingHorizontal: Spacing.md },
  deleteBtnText: { color: Colors.danger },
});
