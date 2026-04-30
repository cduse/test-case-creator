import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AppProfile, Feature, FeatureChange, TestCase, UserType } from '../types';

// ─── In-Memory Cache ─────────────────────────────────────────────────────────

const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

function fromCache<T>(key: string): T | undefined {
  const hit = _cache.get(key);
  if (!hit || Date.now() - hit.ts > CACHE_TTL) { _cache.delete(key); return undefined; }
  return hit.data as T;
}
function toCache(key: string, data: unknown) { _cache.set(key, { data, ts: Date.now() }); }
function bust(...keys: string[]) { keys.forEach(k => _cache.delete(k)); }
function bustPrefix(prefix: string) {
  for (const k of _cache.keys()) { if (k.startsWith(prefix)) _cache.delete(k); }
}

// ─── Local-only AsyncStorage keys (feature steps & context — non-critical AI hints) ───

function stepsKey(featureId: string) { return `feature_steps_${featureId}`; }
function contextKey(productId: string) { return `context_summary_${productId}`; }
function contextGeneratedAtKey(productId: string) { return `context_generated_at_${productId}`; }
function featureChangesKey(productId: string) { return `feature_changes_${productId}`; }
function tcVerifiedAtMapKey(productId: string) { return `tc_verified_at_map_${productId}`; }

export async function setContextGeneratedAt(productId: string): Promise<void> {
  await AsyncStorage.setItem(contextGeneratedAtKey(productId), new Date().toISOString());
}

export async function recordFeatureChanges(productId: string, newChanges: FeatureChange[]): Promise<void> {
  if (newChanges.length === 0) return;
  const key = featureChangesKey(productId);
  const existing: FeatureChange[] = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]');
  const combined = [...existing, ...newChanges].slice(-100);
  await AsyncStorage.setItem(key, JSON.stringify(combined));
}

export async function getFeatureChanges(productId: string): Promise<FeatureChange[]> {
  return JSON.parse((await AsyncStorage.getItem(featureChangesKey(productId))) ?? '[]');
}

export async function setTestCaseVerifiedAt(productId: string, testCaseId: string): Promise<void> {
  const key = tcVerifiedAtMapKey(productId);
  const map: Record<string, string> = JSON.parse((await AsyncStorage.getItem(key)) ?? '{}');
  map[testCaseId] = new Date().toISOString();
  await AsyncStorage.setItem(key, JSON.stringify(map));
}

export async function getTestCaseVerifiedAtMap(productId: string): Promise<Record<string, string>> {
  return JSON.parse((await AsyncStorage.getItem(tcVerifiedAtMapKey(productId))) ?? '{}');
}

// ─── Supabase Settings helpers (user types — org-shared, survives reinstall) ─

const SETTINGS_PREFIX = 'mobile_user_types_';

async function fetchUserTypesFromSettings(productId: string): Promise<UserType[] | null> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', `${SETTINGS_PREFIX}${productId}`)
    .maybeSingle();
  if (!data?.value) return null;
  return Array.isArray(data.value) ? (data.value as UserType[]) : null;
}

async function saveUserTypesToSettings(
  productId: string,
  orgId: string,
  userTypes: UserType[]
): Promise<void> {
  const key = `${SETTINGS_PREFIX}${productId}`;
  // Single upsert using the unique constraint — atomic, no DELETE+INSERT gap
  const { error } = await supabase.from('settings').upsert({
    organization_id: orgId,
    key,
    value: userTypes,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,key' });

  if (error) throw new Error(`Failed to save user types: ${error.message}`);

  // Mirror to AsyncStorage so UI never flickers while Supabase loads
  await AsyncStorage.setItem(key, JSON.stringify(userTypes));
}

async function getUserTypes(productId: string, orgId: string): Promise<UserType[]> {
  // 1. Try Supabase settings (authoritative, org-shared)
  const remote = await fetchUserTypesFromSettings(productId);
  if (remote !== null) return remote;
  // 2. Fallback: AsyncStorage (handles offline + first open before any types saved)
  const local = await AsyncStorage.getItem(`${SETTINGS_PREFIX}${productId}`);
  return local ? JSON.parse(local) : [];
}

// ─── Products / App Profiles ──────────────────────────────────────────────────

export async function getProfiles(): Promise<AppProfile[]> {
  const cacheKey = 'profiles_list';
  const cached = fromCache<AppProfile[]>(cacheKey);
  if (cached) return cached;

  // Fetch products + their features in 2 queries (avoids N+1)
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, organization_id, created_at, updated_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error || !products?.length) return [];

  const productIds = products.map(p => p.id);
  const orgId: string = products[0].organization_id;

  const [{ data: allFeatures }, { data: allSettings }] = await Promise.all([
    supabase
      .from('features')
      .select('id, title, description, product_id, key_flow_steps')
      .in('product_id', productIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('settings')
      .select('key, value')
      .eq('organization_id', orgId)
      .in('key', productIds.map(id => `${SETTINGS_PREFIX}${id}`)),
  ]);

  // Group features by product
  const featuresByProduct: Record<string, typeof allFeatures> = {};
  for (const f of allFeatures ?? []) {
    if (!featuresByProduct[f.product_id]) featuresByProduct[f.product_id] = [];
    featuresByProduct[f.product_id]!.push(f);
  }

  // Group user types by product
  const userTypesByProduct: Record<string, UserType[]> = {};
  for (const s of allSettings ?? []) {
    const productId = (s.key as string).replace(SETTINGS_PREFIX, '');
    userTypesByProduct[productId] = Array.isArray(s.value) ? (s.value as UserType[]) : [];
  }

  const result = await Promise.all(
    products.map(async (p) => {
      const rawFeatures = featuresByProduct[p.id] ?? [];
      const features: Feature[] = await Promise.all(
        rawFeatures.map(async (f) => {
          const dbSteps: string[] = Array.isArray(f.key_flow_steps) ? f.key_flow_steps : [];
          // Fall back to AsyncStorage for features saved before migration 051
          const steps = dbSteps.length > 0
            ? dbSteps
            : JSON.parse((await AsyncStorage.getItem(stepsKey(f.id))) ?? '[]');
          return {
            id: f.id,
            name: f.title,
            description: f.description ?? '',
            steps,
          };
        })
      );
      const userTypes = userTypesByProduct[p.id] ?? [];
      const [contextSummary, contextGeneratedAt] = await Promise.all([
        AsyncStorage.getItem(contextKey(p.id)),
        AsyncStorage.getItem(contextGeneratedAtKey(p.id)),
      ]);
      return {
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        features,
        userTypes,
        contextSummary: contextSummary ?? undefined,
        contextGeneratedAt: contextGeneratedAt ?? undefined,
        createdAt: p.created_at,
        updatedAt: p.updated_at ?? p.created_at,
      } satisfies AppProfile;
    })
  );

  toCache(cacheKey, result);
  return result;
}

export async function getProfile(id: string): Promise<AppProfile | null> {
  const cacheKey = `profile_${id}`;
  const cached = fromCache<AppProfile>(cacheKey);
  if (cached) return cached;

  const { data: p, error } = await supabase
    .from('products')
    .select('id, name, description, organization_id, created_at, updated_at')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !p) return null;

  const [features, userTypes] = await Promise.all([
    getFeaturesForProduct(p.id),
    getUserTypes(p.id, p.organization_id),
  ]);
  const [contextSummary, contextGeneratedAt] = await Promise.all([
    AsyncStorage.getItem(contextKey(p.id)),
    AsyncStorage.getItem(contextGeneratedAtKey(p.id)),
  ]);

  const profile: AppProfile = {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    features,
    userTypes,
    contextSummary: contextSummary ?? undefined,
    contextGeneratedAt: contextGeneratedAt ?? undefined,
    createdAt: p.created_at,
    updatedAt: p.updated_at ?? p.created_at,
  };

  toCache(cacheKey, profile);
  return profile;
}

export async function saveProfile(
  profile: AppProfile,
  userId: string,
  organizationId: string
): Promise<void> {
  const now = new Date().toISOString();

  // ── Product: single upsert (no SELECT round-trip) ─────────────────────────
  const { error: productError } = await supabase.from('products').upsert({
    id: profile.id,
    organization_id: organizationId,
    name: profile.name,
    description: profile.description,
    created_by: userId,
    updated_at: now,
  }, { onConflict: 'id' });
  if (productError) throw new Error(`Failed to save product: ${productError.message}`);

  // ── Features: fetch existing IDs once, then batch write ───────────────────
  const { data: dbFeatures } = await supabase
    .from('features')
    .select('id')
    .eq('product_id', profile.id)
    .is('deleted_at', null);

  const existingIds = new Set((dbFeatures ?? []).map(f => f.id));
  const incomingIds = new Set(profile.features.map(f => f.id));

  // Soft-delete features removed from the list
  const toDelete = (dbFeatures ?? []).filter(f => !incomingIds.has(f.id));

  const newFeatures = profile.features.filter(f => !existingIds.has(f.id));
  const updatedFeatures = profile.features.filter(f => existingIds.has(f.id));

  await Promise.all([
    // Batch soft-delete removed features via SECURITY DEFINER RPC (bypasses
    // RLS WITH CHECK conflicts, mirrors the web app's service-role pattern)
    toDelete.length
      ? supabase.rpc('mobile_soft_delete_features', {
          p_feature_ids: toDelete.map(f => f.id),
          p_user_id: userId,
        }).then(({ error }) => {
          if (error) throw new Error(`Failed to delete features: ${error.message}`);
        })
      : Promise.resolve(),

    // Batch insert new features
    newFeatures.length
      ? supabase.from('features').insert(
          newFeatures.map(f => ({
            id: f.id,
            product_id: profile.id,
            organization_id: organizationId,
            title: f.name,
            description: f.description,
            key_flow_steps: f.steps,
            created_by: userId,
          }))
        ).then(({ error }) => {
          if (error) throw new Error(`Failed to insert features: ${error.message}`);
        })
      : Promise.resolve(),

    // Batch update existing features
    updatedFeatures.length
      ? supabase.from('features').upsert(
          updatedFeatures.map(f => ({
            id: f.id,
            product_id: profile.id,
            organization_id: organizationId,
            title: f.name,
            description: f.description,
            key_flow_steps: f.steps,
            updated_at: now,
          })),
          { onConflict: 'id' }
        ).then(({ error }) => {
          if (error) throw new Error(`Failed to update features: ${error.message}`);
        })
      : Promise.resolve(),

    // Mirror steps to AsyncStorage for offline access
    ...profile.features.map(f =>
      AsyncStorage.setItem(stepsKey(f.id), JSON.stringify(f.steps))
    ),

    // User types → Supabase settings (org-shared)
    saveUserTypesToSettings(profile.id, organizationId, profile.userTypes),

    // Context summary → AsyncStorage
    profile.contextSummary
      ? AsyncStorage.setItem(contextKey(profile.id), profile.contextSummary)
      : Promise.resolve(),
  ]);

  // Invalidate cache
  bust('profiles_list', `profile_${profile.id}`);
}

export async function deleteProfile(id: string, userId: string): Promise<void> {
  await supabase.from('products').update({
    deleted_at: new Date().toISOString(),
    deleted_by: userId,
  }).eq('id', id);

  // Invalidate cache
  bust('profiles_list', `profile_${id}`);
  bustPrefix(`test_cases_${id}`);
}

// ─── Features ────────────────────────────────────────────────────────────────

async function getFeaturesForProduct(productId: string): Promise<Feature[]> {
  const { data } = await supabase
    .from('features')
    .select('id, title, description, key_flow_steps')
    .eq('product_id', productId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (!data) return [];

  return Promise.all(
    data.map(async (f) => {
      const dbSteps: string[] = Array.isArray(f.key_flow_steps) ? f.key_flow_steps : [];
      const steps = dbSteps.length > 0
        ? dbSteps
        : JSON.parse((await AsyncStorage.getItem(stepsKey(f.id))) ?? '[]');
      return {
        id: f.id,
        name: f.title,
        description: f.description ?? '',
        steps,
      } satisfies Feature;
    })
  );
}

// ─── Test Cases ───────────────────────────────────────────────────────────────

export async function getTestCases(productId?: string): Promise<TestCase[]> {
  const cacheKey = `test_cases_${productId ?? 'all'}`;
  const cached = fromCache<TestCase[]>(cacheKey);
  if (cached) return cached;

  let query = supabase
    .from('test_cases')
    .select('id, product_id, feature_id, title, description, preconditions, expected_result, priority, test_type, steps, created_at, tags, features!feature_id(title)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (productId) query = query.eq('product_id', productId);

  const { data, error } = await query;
  if (error || !data) return [];

  const result = data.map(row => mapRowToTestCase(row));
  toCache(cacheKey, result);
  return result;
}

export async function getTestCase(id: string): Promise<TestCase | null> {
  const cacheKey = `test_case_${id}`;
  const cached = fromCache<TestCase>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('test_cases')
    .select('id, product_id, feature_id, title, description, preconditions, expected_result, priority, test_type, steps, created_at, tags, features!feature_id(title)')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !data) return null;
  const result = mapRowToTestCase(data);
  toCache(cacheKey, result);
  return result;
}

export async function saveTestCase(
  testCase: TestCase,
  userId: string,
  organizationId: string,
  allFeatures: Feature[]
): Promise<void> {
  // Resolve feature by name → ID
  const matchedFeature = allFeatures.find(f => f.name === testCase.feature);
  let featureId = matchedFeature?.id;

  if (!featureId) {
    featureId = `feat_${Date.now()}`;
    await supabase.from('features').insert({
      id: featureId,
      product_id: testCase.appProfileId,
      organization_id: organizationId,
      title: testCase.feature,
      description: '',
      created_by: userId,
    });
    // New feature means profile cache is stale
    bust('profiles_list', `profile_${testCase.appProfileId}`);
  }

  // Ensure "Mobile Tests" user story exists — safe for concurrent calls
  const userStoryId = await ensureUserStory(featureId, testCase.appProfileId, organizationId, userId);

  const steps = testCase.steps.map(s => ({
    id: `step_${s.order}`,
    stepNumber: s.order,
    action: s.action,
    expectedResult: s.expectedResult,
    automationHint: s.automationHint,
    status: 'pending',
  }));

  // Single upsert — no existence-check SELECT needed
  const { error: tcError } = await supabase.from('test_cases').upsert({
    id: testCase.id,
    user_story_id: userStoryId,
    feature_id: featureId,
    product_id: testCase.appProfileId,
    organization_id: organizationId,
    title: testCase.title,
    description: testCase.description,
    preconditions: testCase.preconditions.join('\n'),
    expected_result: testCase.expectedResult,
    priority: testCase.priority ?? 'medium',
    test_type: mapTestType(testCase.testType),
    steps,
    created_by: userId,
    updated_at: new Date().toISOString(),
    tags: testCase.tags ?? [],
  }, { onConflict: 'id' });
  if (tcError) throw new Error(`Failed to save test case: ${tcError.message}`);

  // Invalidate caches
  bust(`test_case_${testCase.id}`);
  bust(`test_cases_${testCase.appProfileId}`, 'test_cases_all');
}

export async function deleteTestCase(id: string, userId: string): Promise<void> {
  const tc = await getTestCase(id);

  const { error } = await supabase.rpc('mobile_soft_delete_test_case', {
    p_test_case_id: id,
    p_user_id: userId,
  });
  if (error) throw new Error(`Failed to delete test case: ${error.message}`);

  bust(`test_case_${id}`);
  if (tc) bust(`test_cases_${tc.appProfileId}`, 'test_cases_all');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureUserStory(
  featureId: string,
  productId: string,
  organizationId: string,
  userId: string
): Promise<string> {
  const id = `us_mobile_${featureId}`;
  // ignoreDuplicates = ON CONFLICT DO NOTHING — safe to call repeatedly
  await supabase.from('user_stories').upsert({
    id,
    feature_id: featureId,
    product_id: productId,
    organization_id: organizationId,
    title: 'Mobile Tests',
    description: 'Test cases created from the Testify mobile app.',
    created_by: userId,
  }, { onConflict: 'id', ignoreDuplicates: true });
  return id;
}

function mapTestType(t?: string): string {
  const map: Record<string, string> = {
    regression: 'regression',
    smoke: 'smoke',
    sanity: 'smoke',
    functional: 'functional',
    negative: 'functional',
  };
  return map[t ?? ''] ?? 'functional';
}

function mapRowToTestCase(row: Record<string, unknown>): TestCase {
  const rawSteps = Array.isArray(row.steps) ? row.steps : [];
  const steps = (rawSteps as Record<string, unknown>[]).map((s, i) => ({
    order: (s.stepNumber as number) ?? i + 1,
    action: (s.action as string) ?? '',
    expectedResult: (s.expectedResult as string) ?? '',
    automationHint: s.automationHint as string | undefined,
  }));

  const preconditions =
    typeof row.preconditions === 'string' && row.preconditions
      ? row.preconditions.split('\n').filter(Boolean)
      : [];

  const tags: string[] = Array.isArray(row.tags) ? (row.tags as string[]) : [];

  return {
    id: row.id as string,
    appProfileId: row.product_id as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    feature: (row.features as { title?: string } | null)?.title ?? '',
    priority: row.priority as TestCase['priority'],
    testType: row.test_type as TestCase['testType'],
    preconditions,
    steps,
    expectedResult: (row.expected_result as string) ?? '',
    tags,
    createdAt: row.created_at as string,
  };
}
