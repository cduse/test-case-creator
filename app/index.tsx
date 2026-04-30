import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getProfiles, deleteProfile } from '../services/supabase-db';
import { AppProfile } from '../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useAuth } from '../context/auth';

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function ProfileCard({ profile, onPress, onDelete }: {
  profile: AppProfile;
  onPress: () => void;
  onDelete: () => void;
}) {
  const contextIsStale = !!(
    profile.contextSummary &&
    profile.updatedAt > (profile.contextGeneratedAt ?? '')
  );

  return (
    <TouchableOpacity
      style={[styles.card, contextIsStale && styles.cardStale]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <Text style={styles.cardIconText}>{profile.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{profile.name}</Text>
          <Text style={styles.cardSubtitle} numberOfLines={2}>{profile.description || 'No description'}</Text>
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
        </TouchableOpacity>
      </View>
      <View style={styles.cardMeta}>
        <Pill label={`${profile.features.length} features`} color={Colors.primary} />
        <Pill label={`${profile.userTypes.length} user types`} color={Colors.secondary} />
        {contextIsStale ? (
          <Pill label="⚠ Context outdated" color={Colors.warning} />
        ) : profile.contextSummary ? (
          <Pill label="AI ready" color={Colors.secondary} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profiles, setProfiles] = useState<AppProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getProfiles().then(p => {
        setProfiles(p);
        setLoading(false);
      });
    }, [])
  );

  function handleDelete(profile: AppProfile) {
    Alert.alert(
      'Delete Product',
      `Delete "${profile.name}" and all its test cases?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteProfile(profile.id, user!.id);
            setProfiles(prev => prev.filter(p => p.id !== profile.id));
          },
        },
      ]
    );
  }

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.headerActions}>
        <View>
          <Text style={styles.sectionLabel}>Products</Text>
          {user && (
            <Text style={styles.orgLabel} numberOfLines={1}>
              {user.name}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      ) : profiles.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="clipboard-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Products Yet</Text>
          <Text style={styles.emptySubtitle}>
            Create a product for each app you want to build a regression suite for.
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/profile/create')}>
            <Text style={styles.emptyButtonText}>Create Your First Product</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={p => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ProfileCard
              profile={item}
              onPress={() => router.push(`/profile/${item.id}`)}
              onDelete={() => handleDelete(item)}
            />
          )}
        />
      )}

      {profiles.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/profile/create')}>
          <Ionicons name="add" size={28} color={Colors.white} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  orgLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, maxWidth: 200 },
  headerRight: { flexDirection: 'row', gap: Spacing.xs },
  iconBtn: { padding: Spacing.xs },
  list: { padding: Spacing.md, gap: Spacing.sm },
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  cardStale: { borderColor: Colors.warning + '66' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  cardIcon: {
    width: 44, height: 44, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '33', alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  cardIconText: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.primary },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  deleteBtn: {
    width: 32, height: 32, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.danger + '22', alignItems: 'center', justifyContent: 'center',
    marginLeft: Spacing.xs,
  },
  cardMeta: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  pillText: { fontSize: FontSize.xs, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  emptySubtitle: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyButton: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
  },
  emptyButtonText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
  fab: {
    position: 'absolute', right: Spacing.lg, bottom: Spacing.xl,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
});
