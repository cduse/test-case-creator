export interface UserType {
  id: string;
  name: string;
  description: string;
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  steps: string[];
}

export interface TestStep {
  order: number;
  action: string;
  expectedResult: string;
  automationHint?: string;
}

export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type TestType = 'regression' | 'smoke' | 'sanity' | 'functional' | 'negative';
export type AutomationStatus = 'pending' | 'in_progress' | 'automated' | 'not_feasible';

export interface DataRequirement {
  type: 'account' | 'amount' | 'product' | 'configuration' | 'network' | 'other';
  description: string;
  example?: string;
}

export interface TestCase {
  id: string;
  appProfileId: string;
  title: string;
  description: string;
  userType?: string;
  feature: string;
  priority?: Priority;
  testType?: TestType;
  preconditions: string[];
  steps: TestStep[];
  expectedResult: string;
  dataRequirements?: DataRequirement[];
  tags: string[];
  automationStatus?: AutomationStatus;
  voiceInput?: string;
  createdAt: string;
}

export interface FeatureChange {
  featureId: string;
  featureName: string;
  changedAt: string;
  changes: string[];
}

export interface AppProfile {
  id: string;
  name: string;
  description: string;
  userTypes: UserType[];
  features: Feature[];
  contextSummary?: string;
  contextGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type GeneratedTestCase = Omit<TestCase, 'id' | 'appProfileId' | 'voiceInput' | 'createdAt' | 'automationStatus'>;
