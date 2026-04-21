import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Modal, Alert, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getProfile, saveProfile } from '../../../services/supabase-db';
import { useAuth } from '../../../context/auth';
import { transcribeAudio, parseFeatureFromTranscript } from '../../../services/openai';
import VoiceRecorder from '../../../components/VoiceRecorder';
import { Feature } from '../../../types';
import { generateId } from '../../../utils/id';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../constants/theme';

const EMPTY_FEATURE = (): Feature => ({ id: generateId(), name: '', description: '', steps: [] });

function FeatureModal({
  visible,
  feature,
  onSave,
  onClose,
}: {
  visible: boolean;
  feature: Feature | null;
  onSave: (f: Feature) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Feature>(feature ?? EMPTY_FEATURE());
  const [newStep, setNewStep] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  useCallback(() => {
    if (visible) {
      setDraft(feature ?? EMPTY_FEATURE());
      setNewStep('');
      setVoiceMode(false);
    }
  }, [visible, feature]);

  // Reset when modal opens
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setDraft(feature ?? EMPTY_FEATURE());
      setNewStep('');
      setVoiceMode(false);
    }
  }

  async function handleVoiceComplete(uri: string) {
    setVoiceMode(false);
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

  function addStep() {
    if (!newStep.trim()) return;
    setDraft(d => ({ ...d, steps: [...d.steps, newStep.trim()] }));
    setNewStep('');
  }

  function removeStep(i: number) {
    setDraft(d => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }));
  }

  function handleSave() {
    if (!draft.name.trim()) {
      Alert.alert('Required', 'Please enter a feature name.');
      return;
    }
    onSave(draft);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.title}>{feature?.id && feature.name ? 'Edit Feature' : 'New Feature'}</Text>
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

            <View style={modal.descriptionHeader}>
              <Text style={modal.label}>Description & Key Steps</Text>
              <TouchableOpacity
                style={[modal.voiceBtn, voiceMode && modal.voiceBtnActive]}
                onPress={() => setVoiceMode(v => !v)}
                disabled={transcribing}
              >
                <Ionicons
                  name={voiceMode ? 'close-circle' : 'mic-outline'}
                  size={16}
                  color={voiceMode ? Colors.recording : Colors.primary}
                />
                <Text style={[modal.voiceBtnText, voiceMode && modal.voiceBtnTextActive]}>
                  {transcribing ? 'Transcribing...' : voiceMode ? 'Cancel' : 'Voice'}
                </Text>
              </TouchableOpacity>
            </View>

            {voiceMode ? (
              <View style={modal.voiceContainer}>
                <Text style={modal.voiceHint}>
                  Describe the feature and mention any key steps — e.g. "The buy airtime feature allows users to purchase airtime. First the user selects an amount, then confirms the transaction..."
                </Text>
                <VoiceRecorder onTranscriptionComplete={handleVoiceComplete} disabled={transcribing} />
              </View>
            ) : (
              <TextInput
                style={[modal.input, modal.textArea]}
                value={draft.description}
                onChangeText={v => setDraft(d => ({ ...d, description: v }))}
                placeholder="Describe what this feature does and any key details..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                editable={!transcribing}
              />
            )}

            <Text style={modal.label}>Key Flow Steps</Text>
            {draft.steps.map((step, i) => (
              <View key={i} style={modal.stepRow}>
                <Text style={modal.stepNum}>{i + 1}</Text>
                <Text style={modal.stepText} numberOfLines={2}>{step}</Text>
                <TouchableOpacity onPress={() => removeStep(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}

            <View style={modal.stepInputRow}>
              <TextInput
                style={[modal.input, { flex: 1 }]}
                value={newStep}
                onChangeText={setNewStep}
                placeholder="Add a step..."
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={addStep}
                returnKeyType="done"
              />
              <TouchableOpacity style={modal.stepAddBtn} onPress={addStep}>
                <Ionicons name="add" size={22} color={Colors.secondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={modal.saveBtn} onPress={handleSave}>
              <Text style={modal.saveBtnText}>Save Feature</Text>
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
    const exists = features.some(f => f.id === feature.id);
    const updated = exists
      ? features.map(f => f.id === feature.id ? feature : f)
      : [...features, feature];
    setFeatures(updated);
    await persist(updated);
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
          const updated = features.filter(f => f.id !== feature.id);
          setFeatures(updated);
          await persist(updated);
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
  textArea: { minHeight: 80, textAlignVertical: 'top', paddingTop: Spacing.sm },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  stepNum: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary, width: 20, textAlign: 'center' },
  stepText: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
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
  descriptionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.xs },
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
});
