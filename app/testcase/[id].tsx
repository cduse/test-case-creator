import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Share, ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  getTestCase, getProfile, deleteTestCase, saveTestCase,
  getFeatureChanges, getTestCaseVerifiedAtMap, setTestCaseVerifiedAt,
} from '../../services/supabase-db';
import { formatTestCasesAsText, buildAutomationExport } from '../../services/storage';
import { useAuth } from '../../context/auth';
import { refineTestCase, hasApiKey } from '../../services/openai';
import { TestCase, AppProfile, Priority, TestType, FeatureChange, GeneratedTestCase } from '../../types';
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

function RefinementModal({
  visible,
  testCase,
  profile,
  changes,
  onSave,
  onClose,
}: {
  visible: boolean;
  testCase: TestCase;
  profile: AppProfile;
  changes: FeatureChange[];
  onSave: (refined: GeneratedTestCase) => Promise<void>;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const [refining, setRefining] = useState(false);
  const [refined, setRefined] = useState<GeneratedTestCase | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset state when modal opens
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setComment('');
      setRefining(false);
      setRefined(null);
      setSaving(false);
    }
  }

  const changeDescription = changes
    .flatMap(c => c.changes.map(ch => `${c.featureName}: ${ch}`))
    .join('\n');

  async function handleRefine() {
    if (!hasApiKey()) {
      Alert.alert('API Key Required', 'Please add your OpenAI API key in Settings first.');
      return;
    }
    setRefining(true);
    try {
      const result = await refineTestCase(testCase, profile, changeDescription, comment.trim() || undefined);
      setRefined(result);
    } catch (e: any) {
      Alert.alert('Refinement Failed', e.message);
    } finally {
      setRefining(false);
    }
  }

  async function handleSave() {
    if (!refined) return;
    setSaving(true);
    try {
      await onSave(refined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={ref.container}>
        <View style={ref.header}>
          <Text style={ref.title}>Refine Test Case</Text>
          <TouchableOpacity onPress={onClose} style={ref.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={ref.content} keyboardShouldPersistTaps="handled">

            {/* What changed */}
            <View style={ref.section}>
              <Text style={ref.sectionLabel}>What changed</Text>
              {changes.map((c, ci) => (
                <View key={ci} style={ref.changeGroup}>
                  <View style={ref.changeFeatureRow}>
                    <Ionicons name="layers-outline" size={13} color={Colors.secondary} />
                    <Text style={ref.changeFeatureName}>{c.featureName}</Text>
                    <Text style={ref.changeAt}>
                      {new Date(c.changedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {c.changes.map((ch, i) => (
                    <View key={i} style={ref.changeRow}>
                      <Ionicons name="ellipse" size={6} color={Colors.warning} style={{ marginTop: 5 }} />
                      <Text style={ref.changeText}>{ch}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>

            {/* Comment */}
            {!refined && (
              <View style={ref.section}>
                <Text style={ref.sectionLabel}>Add instructions or notes (optional)</Text>
                <TextInput
                  style={ref.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="e.g. The logout button moved to the profile menu. Keep all other steps the same."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  scrollEnabled={false}
                  editable={!refining}
                />
              </View>
            )}

            {/* Refine button */}
            {!refined && (
              <TouchableOpacity
                style={[ref.refineBtn, refining && { opacity: 0.6 }]}
                onPress={handleRefine}
                disabled={refining}
              >
                {refining
                  ? (
                    <View style={ref.refineBtnInner}>
                      <ActivityIndicator color={Colors.white} size="small" />
                      <Text style={ref.refineBtnText}>Refining with AI...</Text>
                    </View>
                  )
                  : (
                    <View style={ref.refineBtnInner}>
                      <Ionicons name="sparkles" size={16} color={Colors.white} />
                      <Text style={ref.refineBtnText}>Refine with AI</Text>
                    </View>
                  )}
              </TouchableOpacity>
            )}

            {/* Refined result preview */}
            {refined && (
              <View style={ref.resultSection}>
                <Text style={ref.resultLabel}>Refined version ready</Text>

                {refined.title !== testCase.title && (
                  <View style={ref.resultDiff}>
                    <Text style={ref.resultDiffLabel}>Title</Text>
                    <Text style={ref.resultDiffOld}>Before: {testCase.title}</Text>
                    <Text style={ref.resultDiffNew}>After: {refined.title}</Text>
                  </View>
                )}

                {refined.description !== testCase.description && (
                  <View style={ref.resultDiff}>
                    <Text style={ref.resultDiffLabel}>Description updated</Text>
                    <Text style={ref.resultDiffNew}>{refined.description}</Text>
                  </View>
                )}

                <View style={ref.resultDiff}>
                  <Text style={ref.resultDiffLabel}>Steps</Text>
                  <Text style={ref.resultDiffNew}>
                    {testCase.steps.length} → {refined.steps.length} steps
                  </Text>
                </View>

                <View style={ref.resultActions}>
                  <TouchableOpacity
                    style={[ref.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving
                      ? <ActivityIndicator color={Colors.white} size="small" />
                      : <Text style={ref.saveBtnText}>Save Refined Version</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={ref.discardBtn} onPress={() => setRefined(null)}>
                    <Text style={ref.discardBtnText}>Re-refine</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export default function TestCaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [copied, setCopied] = useState(false);
  const [relevantChanges, setRelevantChanges] = useState<FeatureChange[]>([]);
  const [showRefinementModal, setShowRefinementModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    getTestCase(id).then(async tc => {
      setTestCase(tc);
      if (!tc) return;
      const p = await getProfile(tc.appProfileId);
      setProfile(p);
      if (!p) return;
      const [changes, verifiedMap] = await Promise.all([
        getFeatureChanges(tc.appProfileId),
        getTestCaseVerifiedAtMap(tc.appProfileId),
      ]);
      const verifiedAt = verifiedMap[tc.id] ?? tc.createdAt;
      const relevant = changes.filter(c => c.featureName === tc.feature && c.changedAt > verifiedAt);
      setRelevantChanges(relevant);
    });
  }, [id]);

  async function handleRefineSave(refined: GeneratedTestCase) {
    if (!testCase || !profile) return;
    const updated: TestCase = {
      ...refined,
      id: testCase.id,
      appProfileId: testCase.appProfileId,
      voiceInput: testCase.voiceInput,
      automationStatus: testCase.automationStatus,
      createdAt: testCase.createdAt,
    };
    await saveTestCase(updated, user!.id, user!.organizationId, profile.features);
    await setTestCaseVerifiedAt(testCase.appProfileId, testCase.id);
    setTestCase(updated);
    setRelevantChanges([]);
    setShowRefinementModal(false);
  }

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
          try {
            await deleteTestCase(testCase.id, user!.id);
            router.back();
          } catch (e: any) {
            Alert.alert('Delete Failed', e.message ?? 'Could not delete test case. Please try again.');
          }
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

        {/* Refinement banner */}
        {relevantChanges.length > 0 && (
          <TouchableOpacity
            style={styles.refinementBanner}
            onPress={() => setShowRefinementModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-circle-outline" size={22} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.refinementBannerTitle}>Refinement available</Text>
              <Text style={styles.refinementBannerSub}>
                {relevantChanges.reduce((n, c) => n + c.changes.length, 0)} change
                {relevantChanges.reduce((n, c) => n + c.changes.length, 0) !== 1 ? 's' : ''}{' '}
                in "{testCase.feature}" since this test case was created. Tap to review.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.warning} />
          </TouchableOpacity>
        )}

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

      {profile && (
        <RefinementModal
          visible={showRefinementModal}
          testCase={testCase}
          profile={profile}
          changes={relevantChanges}
          onSave={handleRefineSave}
          onClose={() => setShowRefinementModal(false)}
        />
      )}
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

  refinementBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.warning + '15', borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44',
  },
  refinementBannerTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.warning },
  refinementBannerSub: { fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17, marginTop: 2, opacity: 0.85 },

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
});

const ref = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  closeBtn: { padding: Spacing.xs },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  section: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  changeGroup: { gap: 6 },
  changeFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  changeFeatureName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.secondary, flex: 1 },
  changeAt: { fontSize: FontSize.xs, color: Colors.textMuted },
  changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, paddingLeft: Spacing.sm },
  changeText: { fontSize: FontSize.sm, color: Colors.text, flex: 1, lineHeight: 20 },
  commentInput: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.text, fontSize: FontSize.sm, borderWidth: 1, borderColor: Colors.border,
    minHeight: 80, textAlignVertical: 'top',
  },
  refineBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  refineBtnInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  refineBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
  resultSection: {
    backgroundColor: Colors.secondary + '11', borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.secondary + '33', gap: Spacing.sm,
  },
  resultLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.secondary },
  resultDiff: { gap: 4 },
  resultDiffLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  resultDiffOld: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },
  resultDiffNew: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  resultActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  saveBtn: {
    flex: 1, backgroundColor: Colors.secondary, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, alignItems: 'center',
  },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
  discardBtn: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  discardBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
});
