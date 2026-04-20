import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AppProfile, TestCase } from '../types';

const PROFILES_KEY = 'app_profiles';
const TEST_CASES_KEY = 'test_cases';
const API_KEY_STORE = 'openai_api_key';

export async function saveApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_STORE, key);
}

export async function loadApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY_STORE);
}

export async function getProfiles(): Promise<AppProfile[]> {
  const data = await AsyncStorage.getItem(PROFILES_KEY);
  return data ? JSON.parse(data) : [];
}

export async function getProfile(id: string): Promise<AppProfile | null> {
  const profiles = await getProfiles();
  return profiles.find(p => p.id === id) ?? null;
}

export async function saveProfile(profile: AppProfile): Promise<void> {
  const profiles = await getProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = profile;
  } else {
    profiles.unshift(profile);
  }
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = await getProfiles();
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.filter(p => p.id !== id)));
  const testCases = await getTestCases();
  await AsyncStorage.setItem(TEST_CASES_KEY, JSON.stringify(testCases.filter(tc => tc.appProfileId !== id)));
}

export async function getTestCases(profileId?: string): Promise<TestCase[]> {
  const data = await AsyncStorage.getItem(TEST_CASES_KEY);
  const cases: TestCase[] = data ? JSON.parse(data) : [];
  return profileId ? cases.filter(tc => tc.appProfileId === profileId) : cases;
}

export async function getTestCase(id: string): Promise<TestCase | null> {
  const cases = await getTestCases();
  return cases.find(tc => tc.id === id) ?? null;
}

export async function saveTestCase(testCase: TestCase): Promise<void> {
  const cases = await getTestCases();
  const idx = cases.findIndex(tc => tc.id === testCase.id);
  if (idx >= 0) {
    cases[idx] = testCase;
  } else {
    cases.unshift(testCase);
  }
  await AsyncStorage.setItem(TEST_CASES_KEY, JSON.stringify(cases));
}

export async function deleteTestCase(id: string): Promise<void> {
  const cases = await getTestCases();
  await AsyncStorage.setItem(TEST_CASES_KEY, JSON.stringify(cases.filter(tc => tc.id !== id)));
}

export function formatTestCasesAsText(cases: TestCase[], appName: string): string {
  let output = `# Regression Suite — ${appName}\nGenerated: ${new Date().toLocaleDateString()}\n\n`;

  cases.forEach((tc, i) => {
    output += `## TC${String(i + 1).padStart(3, '0')}: ${tc.title}\n\n`;
    output += `**Description:** ${tc.description}\n`;
    if (tc.userType) output += `**User Type:** ${tc.userType}\n`;
    if (tc.feature) output += `**Feature:** ${tc.feature}\n`;
    if (tc.tags.length > 0) output += `**Tags:** ${tc.tags.join(', ')}\n`;
    output += '\n';

    if (tc.preconditions.length > 0) {
      output += `### Preconditions\n`;
      tc.preconditions.forEach(p => { output += `- ${p}\n`; });
      output += '\n';
    }

    output += `### Test Steps\n`;
    tc.steps.forEach(step => {
      output += `**${step.order}.** ${step.action}\n`;
      output += `   → Expected: ${step.expectedResult}\n\n`;
    });

    output += `### Overall Expected Result\n${tc.expectedResult}\n\n`;
    output += '---\n\n';
  });

  return output;
}
