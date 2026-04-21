import { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  getProfile, getTestCases, deleteTestCase, saveProfile,
  formatTestCasesAsText, buildAutomationExport, deleteProfile,
} from '../../../services/storage';
import { generateContextSummary, hasApiKey } from '../../../services/openai';
import { AppProfile, TestCase } from '../../../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../constants/theme';

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
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

function NavRow({ icon, label, count, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.navRowLeft}>
        <View style={styles.navRowIcon}>
          <Ionicons name={icon} size={18} color={Colors.primary} />
        </View>
        <Text style={styles.navRowLabel}>{label}</Text>
      </View>
      <View style={styles.navRowRight}>
        <View style={styles.navRowBadge}>
          <Text style={styles.navRowBadgeText}>{count}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [generatingContext, setGeneratingContext] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

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
      setContextOpen(true);
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

  async function handleDeleteProfile() {
    if (!profile) return;
    Alert.alert(
      'Delete Profile',
      `Delete "${profile.name}" and all its test cases? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteProfile(profile.id);
            router.replace('/');
          },
        },
      ]
    );
  }

  async function handleExportText() {
    if (!profile || testCases.length === 0) return;
    const text = formatTestCasesAsText(testCases, profile.name);
    await Share.share({ message: text, title: `${profile.name} - Test Cases` });
  }

  async function handleExportJson() {
    if (!profile || testCases.length === 0) return;
    try {
      const payload = buildAutomationExport(profile, testCases);
      const json = JSON.stringify(payload, null, 2);
      const fileName = `${profile.name.replace(/\s+/g, '_')}_automation_export.json`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: `Export ${profile.name}` });
      } else {
        Alert.alert('Sharing not available', 'Cannot share files on this device.');
      }
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    }
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

        {/* App Info */}
        <View style={styles.profileCard}>
          <View style={styles.profileCardTop}>
            <View style={styles.profileIcon}>
              <Text style={styles.profileIconText}>{profile.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{profile.name}</Text>
              {profile.description ? (
                <Text style={styles.profileDesc}>{profile.description}</Text>
              ) : (
                <Text style={styles.profileDescEmpty}>No description</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => router.push({ pathname: '/profile/create', params: { id } })}
            >
              <Ionicons name="create-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Features & User Types navigation */}
        <View style={styles.section}>
          <NavRow
            icon="layers-outline"
            label="Features"
            count={profile.features.length}
            onPress={() => router.push(`/profile/${id}/features`)}
          />
          <View style={styles.divider} />
          <NavRow
            icon="people-outline"
            label="User Types"
            count={profile.userTypes.length}
            onPress={() => router.push(`/profile/${id}/user-types`)}
          />
        </View>

        {/* AI Context */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setContextOpen(!contextOpen)}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionTitle}>AI Context</Text>
            <View style={styles.sectionHeaderRight}>
              <TouchableOpacity
                style={[styles.contextBtn, generatingContext && styles.contextBtnLoading]}
                onPress={handleGenerateContext}
                disabled={generatingContext}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {generatingContext
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : (
                    <View style={styles.contextBtnInner}>
                      <Ionicons name="sparkles" size={14} color={Colors.primary} />
                      <Text style={styles.contextBtnText}>
                        {profile.contextSummary ? 'Regenerate' : 'Generate'}
                      </Text>
                    </View>
                  )}
              </TouchableOpacity>
              <Ionicons
                name={contextOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
          {contextOpen && (
            <View style={styles.sectionBody}>
              {profile.contextSummary ? (
                <Text style={styles.contextText}>{profile.contextSummary}</Text>
              ) : (
                <Text style={styles.contextEmpty}>
                  Generate AI context to help the model deeply understand your app's features and user flows.
                  This improves test case quality significantly.
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Test Cases */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Test Cases ({testCases.length})</Text>
            <View style={styles.tcActions}>
              {testCases.length > 0 && (
                <>
                  <TouchableOpacity style={styles.exportBtn} onPress={handleExportJson}>
                    <Ionicons name="download-outline" size={14} color={Colors.secondary} />
                    <Text style={styles.exportBtnText}>JSON</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.exportBtn} onPress={handleExportText}>
                    <Ionicons name="document-text-outline" size={14} color={Colors.secondary} />
                    <Text style={styles.exportBtnText}>Text</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={styles.newTcBtn}
                onPress={() => router.push({ pathname: '/testcase/create', params: { profileId: id } })}
              >
                <Ionicons name="add" size={16} color={Colors.primary} />
                <Text style={styles.newTcBtnText}>New</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.sectionBody}>
            {testCases.length === 0 ? (
              <TouchableOpacity
                style={styles.emptyTc}
                onPress={() => router.push({ pathname: '/testcase/create', params: { profileId: id } })}
              >
                <Ionicons name="mic-outline" size={32} color={Colors.textMuted} />
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

        {/* Delete Profile */}
        <TouchableOpacity style={styles.deleteProfileBtn} onPress={handleDeleteProfile}>
          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          <Text style={styles.deleteProfileText}>Delete Profile</Text>
        </TouchableOpacity>

      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push({ pathname: '/testcase/create', params: { profileId: id } })}
      >
        <Ionicons name="mic" size={26} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 100 },

  profileCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  profileCardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  profileIcon: {
    width: 52, height: 52, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '33', alignItems: 'center', justifyContent: 'center',
  },
  profileIconText: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.primary },
  profileName: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  profileDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  profileDescEmpty: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },
  editBtn: {
    width: 36, height: 36, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },

  section: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md,
  },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  sectionBody: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.md },

  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md,
  },
  navRowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  navRowIcon: {
    width: 32, height: 32, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  navRowLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  navRowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  navRowBadge: {
    backgroundColor: Colors.primary + '33', borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  navRowBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },

  contextBtn: {
    backgroundColor: Colors.primary + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  contextBtnLoading: { opacity: 0.7, minWidth: 90, alignItems: 'center' },
  contextBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contextBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  contextText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  contextEmpty: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20, fontStyle: 'italic' },

  tcActions: { flexDirection: 'row', gap: Spacing.xs },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.secondary + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  exportBtnText: { fontSize: FontSize.sm, color: Colors.secondary, fontWeight: '600' },
  newTcBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: Colors.primary + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  newTcBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },

  emptyTc: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm,
    borderStyle: 'dashed', padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm,
  },
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

  deleteProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.danger + '44',
    borderRadius: BorderRadius.md, backgroundColor: Colors.danger + '11',
  },
  deleteProfileText: { fontSize: FontSize.sm, color: Colors.danger, fontWeight: '600' },

  fab: {
    position: 'absolute', right: Spacing.lg, bottom: Spacing.xl,
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
});
