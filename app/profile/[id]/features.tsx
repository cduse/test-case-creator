import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Modal, Alert, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getProfile, saveProfile, recordFeatureChanges } from '../../../services/supabase-db';
import { useAuth } from '../../../context/auth';
import { transcribeAudio, parseFeatureFromTranscript, mergeFeatureDescription } from '../../../services/openai';
import VoiceRecorder from '../../../components/VoiceRecorder';
import { Feature, FeatureChange } from '../../../types';
import { generateId } from '../../../utils/id';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../constants/theme';

const EMPTY_FEATURE = (): Feature => ({ id: generateId(), name: '', description: '', steps: [] });

type DescMode = 'edit' | 'update-text' | 'update-voice';

function computeFeatureChanges(oldF: Feature, newF: Feature): string[] {
  const changes: string[] = [];
  if (oldF.description !== newF.description) changes.push('Description updated');
  const oldSet = new Set(oldF.steps);
  const newSet = new Set(newF.steps);
  for (const s of newF.steps) {
    if (!oldSet.has(s)) changes.push(`Step added: "${s.length > 60 ? s.slice(0, 60) + '…' : s}"`);
  }
  for (const s of oldF.steps) {
    if (!newSet.has(s)) changes.push(`Step removed: "${s.length > 60 ? s.slice(0, 60) + '…' : s}"`);
  }
  if (changes.length === 0 && oldF.steps.join('|') !== newF.steps.join('|')) {
    changes.push('Steps reordered');
  }
  return changes;
}

function FeatureModal({
  visible,
  feature,
  saving,
  onSave,
  onClose,
}: {
  visible: boolean;
  feature: Feature | null;
  saving: boolean;
  onSave: (f: Feature) => void;
  onClose: () => void;
}) {
  const isEditing = feature !== null && !!feature.name;

  const [draft, setDraft] = useState<Feature>(feature ?? EMPTY_FEATURE());
  const [newStep, setNewStep] = useState('');
  const [descMode, setDescMode] = useState<DescMode>('edit');
  const [voiceActive, setVoiceActive] = useState(false); // for new-feature voice fill
  const [textUpdateInput, setTextUpdateInput] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [descriptionHeight, setDescriptionHeight] = useState(80);
  const [stepInputHeight, setStepInputHeight] = useState(40);

  // Reset when modal opens
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setDraft(feature ?? EMPTY_FEATURE());
      setNewStep('');
      setDescMode('edit');
      setVoiceActive(false);
      setTextUpdateInput('');
      setDescriptionHeight(80);
      setStepInputHeight(40);
    }
  }

  // Voice fill (new feature only) — transcribe and parse both description + steps
  async function handleVoiceFillComplete(uri: string) {
    setVoiceActive(false);
    setTranscribing(true);
    try {
      const transcript = await transcribeAudio(uri);
      const parsed = await parseFeatureFromTranscript(transcript);
      setDraft(d => ({
        ...d,
        description: parsed.description,
        steps: parsed.steps.length > 0 ? parsed.steps : d.steps,
      }));
    } catch (e: any) {
      Alert.alert('Voice Input Failed', e.message);
    } finally {
      setTranscribing(false);
    }
  }

  // Voice update (edit mode) — transcribe then AI-merge into existing description only
  async function handleVoiceUpdateComplete(uri: string) {
    setTranscribing(true);
    try {
      const transcript = await transcribeAudio(uri);
      setMerging(true);
      const merged = await mergeFeatureDescription(draft.description, transcript);
      setDraft(d => ({ ...d, description: merged }));
      setDescMode('edit');
    } catch (e: any) {
      Alert.alert('Voice Update Failed', e.message);
    } finally {
      setTranscribing(false);
      setMerging(false);
    }
  }

  async function handleTextUpdateApply() {
    if (!textUpdateInput.trim()) return;
    setMerging(true);
    try {
      const merged = await mergeFeatureDescription(draft.description, textUpdateInput.trim());
      setDraft(d => ({ ...d, description: merged }));
      setTextUpdateInput('');
      setDescMode('edit');
    } catch (e: any) {
      Alert.alert('Update Failed', e.message);
    } finally {
      setMerging(false);
    }
  }

  function addStep() {
    if (!newStep.trim()) return;
    setDraft(d => ({ ...d, steps: [...d.steps, newStep.trim()] }));
    setNewStep('');
  }

  function removeStep(i: number) {
    setDraft(d => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }));
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.steps.length) return;
    setDraft(d => {
      const steps = [...d.steps];
      [steps[i], steps[j]] = [steps[j]!, steps[i]!];
      return { ...d, steps };
    });
  }

  function handleSave() {
    if (!draft.name.trim()) {
      Alert.alert('Required', 'Please enter a feature name.');
      return;
    }
    onSave(draft);
  }

  const busy = transcribing || merging;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.title}>{isEditing ? 'Edit Feature' : 'New Feature'}</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={modal.content} keyboardShouldPersistTaps="handled">
            <Text style={modal.label}>Feature Name *</Text>
            <TextInput
              style={modal.input}
              value={draft.name}
              onChangeText={v => setDraft(d => ({ ...d, name: v }))}
              placeholder="e.g. Buy Airtime"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />

            {/* Description section */}
            {isEditing ? (
              <>
                <View style={modal.descriptionHeader}>
                  <Text style={modal.label}>Description</Text>
                  <View style={modal.modeTabRow}>
                    {(['edit', 'update-text', 'update-voice'] as DescMode[]).map(mode => (
                      <TouchableOpacity
                        key={mode}
                        style={[modal.modeTab, descMode === mode && modal.modeTabActive]}
                        onPress={() => { setDescMode(mode); setTextUpdateInput(''); }}
                        disabled={busy}
                      >
                        <Text style={[modal.modeTabText, descMode === mode && modal.modeTabTextActive]}>
                          {mode === 'edit' ? 'Edit' : mode === 'update-text' ? 'Text' : 'Voice'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {descMode === 'edit' && (
                  <TextInput
                    style={[modal.input, modal.textArea, { height: descriptionHeight }]}
                    value={draft.description}
                    onChangeText={v => setDraft(d => ({ ...d, description: v }))}
                    onContentSizeChange={e =>
                      setDescriptionHeight(Math.max(80, e.nativeEvent.contentSize.height + 16))
                    }
                    placeholder="Describe what this feature does..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    scrollEnabled={false}
                  />
                )}

                {descMode === 'update-text' && (
                  <View style={modal.updateSection}>
                    <Text style={modal.updateHint}>
                      Describe what changed or what to add — the AI will merge it with the existing description.
                    </Text>
                    <TextInput
                      style={[modal.input, modal.textArea]}
                      value={textUpdateInput}
                      onChangeText={setTextUpdateInput}
                      placeholder="e.g. Users can now also pay with mobile money..."
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      scrollEnabled={false}
                      editable={!busy}
                    />
                    <TouchableOpacity
                      style={[modal.applyBtn, busy && { opacity: 0.5 }]}
                      onPress={handleTextUpdateApply}
                      disabled={busy || !textUpdateInput.trim()}
                    >
                      {merging
                        ? <ActivityIndicator color={Colors.white} size="small" />
                        : <Text style={modal.applyBtnText}>Apply with AI</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                {descMode === 'update-voice' && (
                  <View style={modal.updateSection}>
                    <Text style={modal.updateHint}>
                      {transcribing
                        ? 'Transcribing...'
                        : merging
                          ? 'Merging with AI...'
                          : 'Describe what changed — the AI will merge it with the existing description.'}
                    </Text>
                    {busy
                      ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
                      : <VoiceRecorder onTranscriptionComplete={handleVoiceUpdateComplete} disabled={busy} />}
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={modal.descriptionHeader}>
                  <Text style={modal.label}>Description & Key Steps</Text>
                  <TouchableOpacity
                    style={[modal.voiceBtn, voiceActive && modal.voiceBtnActive]}
                    onPress={() => setVoiceActive(v => !v)}
                    disabled={transcribing}
                  >
                    <Ionicons
                      name={voiceActive ? 'close-circle' : 'mic-outline'}
                      size={16}
                      color={voiceActive ? Colors.recording : Colors.primary}
                    />
                    <Text style={[modal.voiceBtnText, voiceActive && modal.voiceBtnTextActive]}>
                      {transcribing ? 'Transcribing...' : voiceActive ? 'Cancel' : 'Voice'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {voiceActive ? (
                  <View style={modal.voiceContainer}>
                    <Text style={modal.voiceHint}>
                      Describe the feature and any key steps — e.g. "The buy airtime feature allows users to purchase airtime. First the user selects an amount, then confirms the transaction..."
                    </Text>
                    <VoiceRecorder onTranscriptionComplete={handleVoiceFillComplete} disabled={transcribing} />
                  </View>
                ) : (
                  <TextInput
                    style={[modal.input, modal.textArea, { height: descriptionHeight }]}
                    value={draft.description}
                    onChangeText={v => setDraft(d => ({ ...d, description: v }))}
                    onContentSizeChange={e =>
                      setDescriptionHeight(Math.max(80, e.nativeEvent.contentSize.height + 16))
                    }
                    placeholder="Describe what this feature does and any key details..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    scrollEnabled={false}
                    editable={!transcribing}
                  />
                )}
              </>
            )}

            <Text style={modal.label}>Key Flow Steps</Text>
            {draft.steps.map((step, i) => (
              <View key={i} style={modal.stepRow}>
                <Text style={modal.stepNum}>{i + 1}</Text>
                <Text style={modal.stepText}>{step}</Text>
                <View style={modal.stepControls}>
                  <TouchableOpacity
                    onPress={() => moveStep(i, -1)}
                    disabled={i === 0}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name="chevron-up"
                      size={16}
                      color={i === 0 ? Colors.textMuted : Colors.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveStep(i, 1)}
                    disabled={i === draft.steps.length - 1}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={i === draft.steps.length - 1 ? Colors.textMuted : Colors.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeStep(i)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={[modal.stepInputRow, { alignItems: 'flex-end' }]}>
              <TextInput
                style={[modal.input, { flex: 1, height: stepInputHeight }]}
                value={newStep}
                onChangeText={setNewStep}
                onContentSizeChange={e =>
                  setStepInputHeight(Math.max(40, e.nativeEvent.contentSize.height + 16))
                }
                placeholder="Add a step..."
                placeholderTextColor={Colors.textMuted}
                multiline
                scrollEnabled={false}
                blurOnSubmit
                onSubmitEditing={addStep}
              />
              <TouchableOpacity style={modal.stepAddBtn} onPress={addStep}>
                <Ionicons name="add" size={22} color={Colors.secondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[modal.saveBtn, (saving || busy) && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving || busy}
            >
              {saving
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={modal.saveBtnText}>Save Feature</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function FeatureCard({ feature, onEdit, onDelete }: {
  feature: Feature;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{feature.name}</Text>
        {feature.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{feature.description}</Text>
        ) : null}
        {feature.steps.length > 0 && (
          <View style={styles.stepsBadge}>
            <Ionicons name="list-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.stepsBadgeText}>{feature.steps.length} steps</Text>
          </View>
        )}
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onEdit}>
          <Ionicons name="create-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function FeaturesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setLoading(true);
      getProfile(id).then(p => {
        setFeatures(p?.features ?? []);
        setLoading(false);
      });
    }, [id])
  );

  async function persist(updated: Feature[]) {
    const profile = await getProfile(id!);
    if (!profile) return;
    await saveProfile({ ...profile, features: updated, updatedAt: new Date().toISOString() }, user!.id, user!.organizationId);
  }

  async function handleSave(feature: Feature) {
    const oldFeature = features.find(f => f.id === feature.id);
    const isUpdate = !!oldFeature;
    const updated = isUpdate
      ? features.map(f => f.id === feature.id ? feature : f)
      : [...features, feature];
    setFeatures(updated);
    setSaving(true);
    try {
      await persist(updated);
      if (isUpdate && oldFeature) {
        const changes = computeFeatureChanges(oldFeature, feature);
        if (changes.length > 0) {
          await recordFeatureChanges(id!, [{
            featureId: feature.id,
            featureName: feature.name,
            changedAt: new Date().toISOString(),
            changes,
          }]);
        }
      }
    } finally {
      setSaving(false);
    }
    setModalVisible(false);
    setEditingFeature(null);
  }

  function handleEdit(feature: Feature) {
    setEditingFeature(feature);
    setModalVisible(true);
  }

  function handleDelete(feature: Feature) {
    Alert.alert('Delete Feature', `Delete "${feature.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const previous = features;
          const updated = features.filter(f => f.id !== feature.id);
          setFeatures(updated);
          try {
            await persist(updated);
          } catch (e: any) {
            setFeatures(previous);
            Alert.alert('Delete Failed', e.message ?? 'Could not delete feature. Please try again.');
          }
        },
      },
    ]);
  }

  const filtered = search.trim()
    ? features.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.description.toLowerCase().includes(search.toLowerCase())
      )
    : features;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search features..."
          placeholderTextColor={Colors.textMuted}
          clearButtonMode="while-editing"
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="layers-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>
            {search.trim() ? 'No matching features' : 'No features yet'}
          </Text>
          {!search.trim() && (
            <Text style={styles.emptySubtitle}>
              Add features to help the AI understand your app's functionality.
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={f => f.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <FeatureCard
              feature={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setEditingFeature(null);
          setModalVisible(true);
        }}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      <FeatureModal
        visible={modalVisible}
        feature={editingFeature}
        saving={saving}
        onSave={handleSave}
        onClose={() => {
          setModalVisible(false);
          setEditingFeature(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: {
    flex: 1, fontSize: FontSize.md, color: Colors.text,
    paddingVertical: Spacing.xs,
  },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
  },
  cardContent: { flex: 1, gap: 4 },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  cardDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  stepsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2,
  },
  stepsBadgeText: { fontSize: FontSize.xs, color: Colors.textMuted },
  cardActions: { flexDirection: 'row', gap: Spacing.xs },
  actionBtn: {
    width: 34, height: 34, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  actionBtnDanger: { backgroundColor: Colors.danger + '22' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textSecondary },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute', right: Spacing.lg, bottom: Spacing.xl,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  closeBtn: { padding: Spacing.xs },
  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.xs },
  input: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.text, fontSize: FontSize.sm, borderWidth: 1, borderColor: Colors.border,
  },
  textArea: { textAlignVertical: 'top', paddingTop: Spacing.sm, minHeight: 80 },
  descriptionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.xs,
  },
  modeTabRow: { flexDirection: 'row', gap: 4 },
  modeTab: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceAlt,
    borderWidth: 1, borderColor: Colors.border,
  },
  modeTabActive: { backgroundColor: Colors.primary + '33', borderColor: Colors.primary },
  modeTabText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  modeTabTextActive: { color: Colors.primary },
  updateSection: { gap: Spacing.sm },
  updateHint: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18, fontStyle: 'italic' },
  applyBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, alignItems: 'center',
  },
  applyBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
  voiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  voiceBtnActive: { backgroundColor: Colors.recording + '22' },
  voiceBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primary },
  voiceBtnTextActive: { color: Colors.recording },
  voiceContainer: { gap: Spacing.sm },
  voiceHint: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18, fontStyle: 'italic' },
  stepRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  stepNum: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary, width: 20, textAlign: 'center', marginTop: 2 },
  stepText: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  stepControls: { flexDirection: 'column', alignItems: 'center', gap: 2 },
  stepInputRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  stepAddBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.secondary + '33', alignItems: 'center', justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', marginTop: Spacing.md,
  },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
