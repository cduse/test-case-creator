import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { saveProfile, getProfile } from '../../services/storage';
import { AppProfile, Feature, UserType } from '../../types';
import { generateId } from '../../utils/id';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
        <Text style={styles.addBtnText}>+ Add</Text>
      </TouchableOpacity>
    </View>
  );
}

function UserTypeEditor({ ut, onChange, onDelete }: {
  ut: UserType;
  onChange: (ut: UserType) => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemCardHeader}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={ut.name}
          onChangeText={v => onChange({ ...ut, name: v })}
          placeholder="User type name (e.g. Prestige User)"
          placeholderTextColor={Colors.textMuted}
        />
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={ut.description}
        onChangeText={v => onChange({ ...ut, description: v })}
        placeholder="Describe this user type and how their experience differs from others..."
        placeholderTextColor={Colors.textMuted}
        multiline
        numberOfLines={3}
      />
    </View>
  );
}

function FeatureEditor({ feature, onChange, onDelete }: {
  feature: Feature;
  onChange: (f: Feature) => void;
  onDelete: () => void;
}) {
  const [newStep, setNewStep] = useState('');

  function addStep() {
    if (!newStep.trim()) return;
    onChange({ ...feature, steps: [...feature.steps, newStep.trim()] });
    setNewStep('');
  }

  function removeStep(i: number) {
    onChange({ ...feature, steps: feature.steps.filter((_, idx) => idx !== i) });
  }

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemCardHeader}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={feature.name}
          onChangeText={v => onChange({ ...feature, name: v })}
          placeholder="Feature name (e.g. Buy Airtime)"
          placeholderTextColor={Colors.textMuted}
        />
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={feature.description}
        onChangeText={v => onChange({ ...feature, description: v })}
        placeholder="Describe what this feature does and any key details..."
        placeholderTextColor={Colors.textMuted}
        multiline
        numberOfLines={2}
      />

      {feature.steps.length > 0 && (
        <View style={styles.stepsContainer}>
          {feature.steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <Text style={styles.stepText} numberOfLines={2}>{step}</Text>
              <TouchableOpacity onPress={() => removeStep(i)}>
                <Text style={styles.stepDelete}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.stepInputRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={newStep}
          onChangeText={setNewStep}
          placeholder="Add a key step in the flow..."
          placeholderTextColor={Colors.textMuted}
          onSubmitEditing={addStep}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.stepAddBtn} onPress={addStep}>
          <Text style={styles.stepAddBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CreateProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [loading, setLoading] = useState(isEditing);
  const [existingProfile, setExistingProfile] = useState<AppProfile | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [userTypes, setUserTypes] = useState<UserType[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Edit Profile' : 'New App Profile' });
  }, [isEditing]);

  useEffect(() => {
    if (!id) return;
    getProfile(id).then(profile => {
      if (profile) {
        setExistingProfile(profile);
        setName(profile.name);
        setDescription(profile.description);
        setUserTypes(profile.userTypes);
        setFeatures(profile.features);
      }
      setLoading(false);
    });
  }, [id]);

  function addUserType() {
    setUserTypes(prev => [...prev, { id: generateId(), name: '', description: '' }]);
  }

  function addFeature() {
    setFeatures(prev => [...prev, { id: generateId(), name: '', description: '', steps: [] }]);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter the app name.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const profile: AppProfile = {
        id: existingProfile?.id ?? generateId(),
        name: name.trim(),
        description: description.trim(),
        userTypes: userTypes.filter(ut => ut.name.trim()),
        features: features.filter(f => f.name.trim()),
        contextSummary: existingProfile?.contextSummary,
        createdAt: existingProfile?.createdAt ?? now,
        updatedAt: now,
      };
      await saveProfile(profile);
      router.replace(`/profile/${profile.id}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
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
          <View style={styles.section}>
            <Text style={styles.label}>App Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. MTN Mobile App"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="What does this app do? What is its primary purpose?"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.section}>
            <SectionHeader title="User Types" onAdd={addUserType} />
            <Text style={styles.hint}>
              Define different types of users and how their experience differs (e.g. Regular User vs Prestige User with different home screens).
            </Text>
            {userTypes.map((ut, i) => (
              <UserTypeEditor
                key={ut.id}
                ut={ut}
                onChange={updated => setUserTypes(prev => prev.map((u, idx) => idx === i ? updated : u))}
                onDelete={() => setUserTypes(prev => prev.filter((_, idx) => idx !== i))}
              />
            ))}
            <TouchableOpacity style={styles.emptyAddBtn} onPress={addUserType}>
              <Text style={styles.emptyAddBtnText}>+ Add User Type</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Features" onAdd={addFeature} />
            <Text style={styles.hint}>
              Add each key feature of the app. Include the typical flow steps so the AI can infer what happens when you mention a feature in a test case.
            </Text>
            {features.map((f, i) => (
              <FeatureEditor
                key={f.id}
                feature={f}
                onChange={updated => setFeatures(prev => prev.map((ft, idx) => idx === i ? updated : ft))}
                onDelete={() => setFeatures(prev => prev.filter((_, idx) => idx !== i))}
              />
            ))}
            <TouchableOpacity style={styles.emptyAddBtn} onPress={addFeature}>
              <Text style={styles.emptyAddBtnText}>+ Add Feature</Text>
            </TouchableOpacity>
          </View>

          {isEditing && (
            <View style={styles.editNote}>
              <Text style={styles.editNoteText}>
                💡 After saving, re-generate the AI Context so it reflects your new features and user types.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Create Profile'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  section: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  addBtn: {
    backgroundColor: Colors.primary + '22', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  addBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  hint: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 18 },
  input: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.text, fontSize: FontSize.sm, borderWidth: 1, borderColor: Colors.border,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top', paddingTop: Spacing.sm },
  itemCard: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  itemCardHeader: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  deleteBtn: {
    width: 32, height: 32, borderRadius: BorderRadius.sm, backgroundColor: Colors.danger + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { color: Colors.danger, fontSize: FontSize.sm, fontWeight: '700' },
  stepsContainer: { gap: 4 },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.background, borderRadius: BorderRadius.sm, padding: Spacing.sm,
  },
  stepNum: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary, width: 16, textAlign: 'center' },
  stepText: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  stepDelete: { fontSize: FontSize.sm, color: Colors.textMuted },
  stepInputRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  stepAddBtn: {
    width: 36, height: 36, borderRadius: BorderRadius.sm, backgroundColor: Colors.secondary + '33',
    alignItems: 'center', justifyContent: 'center',
  },
  stepAddBtnText: { color: Colors.secondary, fontSize: 22, fontWeight: '300', lineHeight: 28 },
  emptyAddBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, borderStyle: 'dashed',
    padding: Spacing.md, alignItems: 'center',
  },
  emptyAddBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  editNote: {
    backgroundColor: Colors.warning + '11', borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '33',
  },
  editNoteText: { fontSize: FontSize.sm, color: Colors.warning, lineHeight: 20 },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
