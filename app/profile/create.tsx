import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { saveProfile, getProfile } from '../../services/supabase-db';
import { AppProfile } from '../../types';
import { generateId } from '../../utils/id';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { useAuth } from '../../context/auth';

export default function CreateProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const { user } = useAuth();

  const [loading, setLoading] = useState(isEditing);
  const [existingProfile, setExistingProfile] = useState<AppProfile | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Edit Product' : 'New Product' });
  }, [isEditing]);

  useEffect(() => {
    if (!id) return;
    getProfile(id).then(profile => {
      if (profile) {
        setExistingProfile(profile);
        setName(profile.name);
        setDescription(profile.description);
      }
      setLoading(false);
    });
  }, [id]);

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
        userTypes: existingProfile?.userTypes ?? [],
        features: existingProfile?.features ?? [],
        contextSummary: existingProfile?.contextSummary,
        createdAt: existingProfile?.createdAt ?? now,
        updatedAt: now,
      };
      await saveProfile(profile, user!.id, user!.organizationId);
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
              autoFocus={!isEditing}
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

          {isEditing && (
            <View style={styles.hint}>
              <Text style={styles.hintText}>
                Manage features and user types from the profile detail screen.
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
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.text, fontSize: FontSize.sm, borderWidth: 1, borderColor: Colors.border,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top', paddingTop: Spacing.sm },
  hint: {
    backgroundColor: Colors.primary + '11', borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33',
  },
  hintText: { fontSize: FontSize.sm, color: Colors.primary, lineHeight: 20 },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
