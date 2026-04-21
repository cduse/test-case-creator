import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Modal, Alert, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getProfile, saveProfile } from '../../../services/storage';
import { UserType } from '../../../types';
import { generateId } from '../../../utils/id';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../constants/theme';

const EMPTY_USER_TYPE = (): UserType => ({ id: generateId(), name: '', description: '' });

function UserTypeModal({
  visible,
  userType,
  onSave,
  onClose,
}: {
  visible: boolean;
  userType: UserType | null;
  onSave: (ut: UserType) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<UserType>(userType ?? EMPTY_USER_TYPE());

  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setDraft(userType ?? EMPTY_USER_TYPE());
    }
  }

  function handleSave() {
    if (!draft.name.trim()) {
      Alert.alert('Required', 'Please enter a user type name.');
      return;
    }
    onSave(draft);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.title}>{userType?.id && userType.name ? 'Edit User Type' : 'New User Type'}</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={modal.content} keyboardShouldPersistTaps="handled">
            <Text style={modal.label}>User Type Name *</Text>
            <TextInput
              style={modal.input}
              value={draft.name}
              onChangeText={v => setDraft(d => ({ ...d, name: v }))}
              placeholder="e.g. Prestige User"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />

            <Text style={modal.label}>Description</Text>
            <TextInput
              style={[modal.input, modal.textArea]}
              value={draft.description}
              onChangeText={v => setDraft(d => ({ ...d, description: v }))}
              placeholder="Describe this user type and how their experience differs from others..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity style={modal.saveBtn} onPress={handleSave}>
              <Text style={modal.saveBtnText}>Save User Type</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function UserTypeCard({ userType, onEdit, onDelete }: {
  userType: UserType;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{userType.name}</Text>
        {userType.description ? (
          <Text style={styles.cardDesc} numberOfLines={3}>{userType.description}</Text>
        ) : null}
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

export default function UserTypesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [userTypes, setUserTypes] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUserType, setEditingUserType] = useState<UserType | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setLoading(true);
      getProfile(id).then(p => {
        setUserTypes(p?.userTypes ?? []);
        setLoading(false);
      });
    }, [id])
  );

  async function persist(updated: UserType[]) {
    const profile = await getProfile(id!);
    if (!profile) return;
    await saveProfile({ ...profile, userTypes: updated, updatedAt: new Date().toISOString() });
  }

  async function handleSave(userType: UserType) {
    const exists = userTypes.some(ut => ut.id === userType.id);
    const updated = exists
      ? userTypes.map(ut => ut.id === userType.id ? userType : ut)
      : [...userTypes, userType];
    setUserTypes(updated);
    await persist(updated);
    setModalVisible(false);
    setEditingUserType(null);
  }

  function handleEdit(userType: UserType) {
    setEditingUserType(userType);
    setModalVisible(true);
  }

  function handleDelete(userType: UserType) {
    Alert.alert('Delete User Type', `Delete "${userType.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const updated = userTypes.filter(ut => ut.id !== userType.id);
          setUserTypes(updated);
          await persist(updated);
        },
      },
    ]);
  }

  const filtered = search.trim()
    ? userTypes.filter(ut =>
        ut.name.toLowerCase().includes(search.toLowerCase()) ||
        ut.description.toLowerCase().includes(search.toLowerCase())
      )
    : userTypes;

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
          placeholder="Search user types..."
          placeholderTextColor={Colors.textMuted}
          clearButtonMode="while-editing"
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>
            {search.trim() ? 'No matching user types' : 'No user types yet'}
          </Text>
          {!search.trim() && (
            <Text style={styles.emptySubtitle}>
              Define different user personas to help the AI generate targeted test cases.
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={ut => ut.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <UserTypeCard
              userType={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setEditingUserType(null);
          setModalVisible(true);
        }}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      <UserTypeModal
        visible={modalVisible}
        userType={editingUserType}
        onSave={handleSave}
        onClose={() => {
          setModalVisible(false);
          setEditingUserType(null);
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
  textArea: { minHeight: 100, textAlignVertical: 'top', paddingTop: Spacing.sm },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', marginTop: Spacing.md,
  },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
});
