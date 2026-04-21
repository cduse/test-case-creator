import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AppProfile, Feature, TestCase, UserType } from '../types';

// Local keys for mobile-only enrichment data
function stepsKey(featureId: string) { return `feature_steps_${featureId}`; }
function userTypesKey(productId: string) { return `user_types_${productId}`; }
function contextKey(productId: string) { return `context_summary_${productId}`; }

// ─── Products / App Profiles ─────────────────────────────────────────────────

export async function getProfiles(): Promise<AppProfile[]> {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, created_at, updated_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error || !products) return [];

  return Promise.all(
    products.map(async (p) => {
      const features = await getFeaturesForProduct(p.id);
      const userTypes = await getUserTypes(p.id);
      const contextSummary = await AsyncStorage.getItem(contextKey(p.id)) ?? undefined;

      return {
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        features,
        userTypes,
        contextSummary: contextSummary ?? undefined,
        createdAt: p.created_at,
        updatedAt: p.updated_at ?? p.created_at,
      } satisfies AppProfile;
    })
  );
}

export async function getProfile(id: string): Promise<AppProfile | null> {
  const { data: p, error } = await supabase
    .from('products')
    .select('id, name, description, created_at, updated_at')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !p) return null;

  const features = await getFeaturesForProduct(p.id);
  const userTypes = await getUserTypes(p.id);
  const contextSummary = await AsyncStorage.getItem(contextKey(p.id)) ?? undefined;

  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    features,
    userTypes,
    contextSummary: contextSummary ?? undefined,
    createdAt: p.created_at,
    updatedAt: p.updated_at ?? p.created_at,
  };
}

export async function saveProfile(
  profile: AppProfile,
  userId: string,
  organizationId: string
): Promise<void> {
  await supabase.from('products').upsert({
    id: profile.id,
    organization_id: organizationId,
    name: profile.name,
    description: profile.description,
    created_by: userId,
    updated_at: new Date().toISOString(),
  });

  // Sync features
  for (const feature of profile.features) {
    await supabase.from('features').upsert({
      id: feature.id,
      product_id: profile.id,
      organization_id: organizationId,
      title: feature.name,
      description: feature.description,
      created_by: userId,
      updated_at: new Date().toISOString(),
    });
    // Store flow steps locally
    await AsyncStorage.setItem(stepsKey(feature.id), JSON.stringify(feature.steps));
  }

  // Store mobile-only data locally
  await saveUserTypes(profile.id, profile.userTypes);
  if (profile.contextSummary) {
    await AsyncStorage.setItem(contextKey(profile.id), profile.contextSummary);
  }
}

export async function deleteProfile(id: string, userId: string): Promise<void> {
  await supabase.from('products').update({
    deleted_at: new Date().toISOString(),
    deleted_by: userId,
  }).eq('id', id);
}

// ─── Features ────────────────────────────────────────────────────────────────

async function getFeaturesForProduct(productId: string): Promise<Feature[]> {
  const { data } = await supabase
    .from('features')
    .select('id, title, description')
    .eq('product_id', productId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (!data) return [];

  return Promise.all(
    data.map(async (f) => {
      const stepsJson = await AsyncStorage.getItem(stepsKey(f.id));
      return {
        id: f.id,
        name: f.title,
        description: f.description ?? '',
        steps: stepsJson ? JSON.parse(stepsJson) : [],
      } satisfies Feature;
    })
  );
}

// ─── User Types (stored locally, scoped to product) ──────────────────────────

async function getUserTypes(productId: string): Promise<UserType[]> {
  const json = await AsyncStorage.getItem(userTypesKey(productId));
  return json ? JSON.parse(json) : [];
}

async function saveUserTypes(productId: string, userTypes: UserType[]): Promise<void> {
  await AsyncStorage.setItem(userTypesKey(productId), JSON.stringify(userTypes));
}

// ─── Test Cases ──────────────────────────────────────────────────────────────

export async function getTestCases(productId?: string): Promise<TestCase[]> {
  let query = supabase
    .from('test_cases')
    .select('id, product_id, feature_id, title, description, preconditions, expected_result, priority, test_type, steps, created_at, tags, features!feature_id(title)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (productId) query = query.eq('product_id', productId);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map(row => mapRowToTestCase(row));
}

export async function getTestCase(id: string): Promise<TestCase | null> {
  const { data, error } = await supabase
    .from('test_cases')
    .select('id, product_id, feature_id, title, description, preconditions, expected_result, priority, test_type, steps, created_at, tags, features!feature_id(title)')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !data) return null;
  return mapRowToTestCase(data);
}

export async function saveTestCase(
  testCase: TestCase,
  userId: string,
  organizationId: string,
  allFeatures: Feature[]
): Promise<void> {
  // Resolve feature ID from name
  const matchedFeature = allFeatures.find(f => f.name === testCase.feature);
  let featureId = matchedFeature?.id;

  if (!featureId) {
    // Feature not found — create it
    featureId = `feat_${Date.now()}`;
    await supabase.from('features').insert({
      id: featureId,
      product_id: testCase.appProfileId,
      organization_id: organizationId,
      title: testCase.feature,
      description: '',
      created_by: userId,
    });
  }

  // Ensure a "Mobile Tests" user story exists for this feature
  const userStoryId = await ensureUserStory(featureId, testCase.appProfileId, organizationId, userId);

  const steps = testCase.steps.map(s => ({
    id: `step_${s.order}`,
    stepNumber: s.order,
    action: s.action,
    expectedResult: s.expectedResult,
    automationHint: s.automationHint,
    status: 'pending',
  }));

  const tags = testCase.tags ?? [];

  await supabase.from('test_cases').upsert({
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
  });
}

export async function deleteTestCase(id: string, userId: string): Promise<void> {
  await supabase.from('test_cases').update({
    deleted_at: new Date().toISOString(),
    deleted_by: userId,
  }).eq('id', id);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureUserStory(
  featureId: string,
  productId: string,
  organizationId: string,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('user_stories')
    .select('id')
    .eq('feature_id', featureId)
    .eq('title', 'Mobile Tests')
    .is('deleted_at', null)
    .single();

  if (data?.id) return data.id;

  const id = `us_mobile_${featureId}`;
  await supabase.from('user_stories').insert({
    id,
    feature_id: featureId,
    product_id: productId,
    organization_id: organizationId,
    title: 'Mobile Tests',
    description: 'Test cases created from the Testify mobile app.',
    created_by: userId,
  });
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
  const steps = rawSteps.map((s: Record<string, unknown>, i: number) => ({
    order: (s.stepNumber as number) ?? i + 1,
    action: (s.action as string) ?? '',
    expectedResult: (s.expectedResult as string) ?? '',
    automationHint: s.automationHint as string | undefined,
  }));

  const preconditions = typeof row.preconditions === 'string' && row.preconditions
    ? row.preconditions.split('\n').filter(Boolean)
    : [];

  let tags: string[] = [];
  if (typeof row.tags === 'string') {
    try { tags = JSON.parse(row.tags); } catch { tags = []; }
  } else if (Array.isArray(row.tags)) {
    tags = row.tags;
  }

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
