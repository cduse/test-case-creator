import { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getProfile, getTestCases, deleteTestCase, saveProfile, formatTestCasesAsText } from '../../services/storage';
import { generateContextSummary, hasApiKey } from '../../services/openai';
import { AppProfile, TestCase } from '../../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setOpen(!open)}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function TestCaseRow({ tc, onPress, onDelete }: {
  tc: TestCase; onPress: () => void; onDelete: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tcRow} onPress={onPress} onLongPress={onDelete} activeOpacity={0.7}>
      <View style={styles.tcRowContent}>
        <Text style={styles.tcTitle} numberOfLines={2}>{tc.title}</Text>
        <View style={styles.tcMeta}>
          {tc.userType && <Text style={styles.tcTag}>{tc.userType}</Text>}
          {tc.feature && <Text style={[styles.tcTag, styles.tcFeatureTag]}>{tc.feature}</Text>}
          <Text style={styles.tcStepCount}>{tc.steps.length} steps</Text>
        </View>
      </View>
      <Text style={styles.tcChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [generatingContext, setGeneratingContext] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getProfile(id).then(p => setProfile(p));
      getTestCases(id).then(tc => setTestCases(tc));
    }, [id])
  );

  async function handleGenerateContext() {
    if (!profile) return;
    if (!hasApiKey()) {
      Alert.alert('API Key Required', 'Please add your OpenAI API key in Settings first.', [
        { text: 'Go to Settings', onPress: () => router.push('/settings') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    setGeneratingContext(true);
    try {
      const summary = await generateContextSummary(profile);
      const updated = { ...profile, contextSummary: summary, updatedAt: new Date().toISOString() };
      await saveProfile(updated);
      setProfile(updated);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setGeneratingContext(false);
    }
  }

  async function handleDeleteTestCase(tc: TestCase) {
    Alert.alert('Delete Test Case', `Delete "${tc.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteTestCase(tc.id);
          setTestCases(prev => prev.filter(t => t.id !== tc.id));
        },
      },
    ]);
  }

  async function handleExport() {
    if (!profile || testCases.length === 0) return;
    const text = formatTestCasesAsText(testCases, profile.name);
    await Share.share({ message: text, title: `${profile.name} - Test Cases` });
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={styles.profileIcon}>
            <Text style={styles.profileIconText}>{profile.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile.name}</Text>
            {profile.description ? (
              <Text style={styles.profileDesc}>{profile.description}</Text>
            ) : null}
          </View>
        </View>

        {profile.userTypes.length > 0 && (
          <Section title={`User Types (${profile.userTypes.length})`}>
            {profile.userTypes.map(ut => (
              <View key={ut.id} style={styles.listItem}>
                <Text style={styles.listItemTitle}>{ut.name}</Text>
                {ut.description ? <Text style={styles.listItemDesc}>{ut.description}</Text> : null}
              </View>
            ))}
          </Section>
        )}

        {profile.features.length > 0 && (
          <Section title={`Features (${profile.features.length})`} defaultOpen={false}>
            {profile.features.map(f => (
              <View key={f.id} style={styles.listItem}>
                <Text style={styles.listItemTitle}>{f.name}</Text>
                {f.description ? <Text style={styles.listItemDesc}>{f.description}</Text> : null}
                {f.steps.length > 0 && (
                  <View style={styles.featureSteps}>
                    {f.steps.map((step, i) => (
                      <Text key={i} style={styles.featureStep}>{i + 1}. {step}</Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </Section>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>AI Context</Text>
            <TouchableOpacity
              style={[styles.contextBtn, generatingContext && styles.contextBtnLoading]}
              onPress={handleGenerateContext}
              disabled={generatingContext}
            >
              {generatingContext
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={styles.contextBtnText}>{profile.contextSummary ? '↻ Regenerate' : '✨ Generate'}</Text>}
            </TouchableOpacity>
          </View>
          {profile.contextSummary ? (
            <View style={styles.sectionBody}>
              <Text style={styles.contextText}>{profile.contextSummary}</Text>
            </View>
          ) : (
            <View style={styles.sectionBody}>
              <Text style={styles.contextEmpty}>
                Generate AI context to help the model deeply understand your app's features and user flows.
                This improves test case quality significantly.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Test Cases ({testCases.length})</Text>
            <View style={styles.tcActions}>
              {testCases.length > 0 && (
                <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                  <Text style={styles.exportBtnText}>Export</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.newTcBtn}
                onPress={() => router.push({ pathname: '/testcase/create', params: { profileId: id } })}
              >
                <Text style={styles.newTcBtnText}>+ New</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.sectionBody}>
            {testCases.length === 0 ? (
              <TouchableOpacity
                style={styles.emptyTc}
                onPress={() => router.push({ pathname: '/testcase/create', params: { profileId: id } })}
              >
                <Text style={styles.emptyTcIcon}>🎙️</Text>
                <Text style={styles.emptyTcText}>Record your first test case</Text>
              </TouchableOpacity>
            ) : (
              testCases.map(tc => (
                <TestCaseRow
                  key={tc.id}
                  tc={tc}
                  onPress={() => router.push(`/testcase/${tc.id}`)}
                  onDelete={() => handleDeleteTestCase(tc)}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push({ pathname: '/testcase/create', params: { profileId: id } })}
      >
        <Text style={styles.fabText}>🎙️</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 100 },
  profileHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  profileIcon: {
    width: 52, height: 52, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '33', alignItems: 'center', justifyContent: 'center',
  },
  profileIconText: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.primary },
  profileName: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  profileDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  section: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  chevron: { color: Colors.textSecondary, fontSize: FontSize.sm },
  sectionBody: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm },
  listItem: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, gap: 4,
  },
  listItemTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  listItemDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  featureSteps: { marginTop: 4, gap: 2 },
  featureStep: { fontSize: FontSize.xs, color: Colors.textMuted, paddingLeft: 4 },
  contextBtn: {
    backgroundColor: Colors.primary + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, minWidth: 80, alignItems: 'center',
  },
  contextBtnLoading: { opacity: 0.7 },
  contextBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  contextText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  contextEmpty: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20, fontStyle: 'italic' },
  tcActions: { flexDirection: 'row', gap: Spacing.sm },
  exportBtn: {
    backgroundColor: Colors.secondary + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  exportBtnText: { fontSize: FontSize.sm, color: Colors.secondary, fontWeight: '600' },
  newTcBtn: {
    backgroundColor: Colors.primary + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  newTcBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  emptyTc: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm,
    borderStyle: 'dashed', padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm,
  },
  emptyTcIcon: { fontSize: 32 },
  emptyTcText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  tcRow: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    padding: Spacing.md, flexDirection: 'row', alignItems: 'center',
  },
  tcRowContent: { flex: 1, gap: 6 },
  tcTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, lineHeight: 20 },
  tcMeta: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap', alignItems: 'center' },
  tcTag: {
    fontSize: FontSize.xs, color: Colors.primary, backgroundColor: Colors.primary + '22',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full,
  },
  tcFeatureTag: { color: Colors.secondary, backgroundColor: Colors.secondary + '22' },
  tcStepCount: { fontSize: FontSize.xs, color: Colors.textMuted },
  tcChevron: { fontSize: FontSize.xl, color: Colors.textMuted, marginLeft: Spacing.sm },
  fab: {
    position: 'absolute', right: Spacing.lg, bottom: Spacing.xl,
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  fabText: { fontSize: 26 },
});
