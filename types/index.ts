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
}

export interface TestCase {
  id: string;
  appProfileId: string;
  title: string;
  description: string;
  userType?: string;
  feature: string;
  preconditions: string[];
  steps: TestStep[];
  expectedResult: string;
  tags: string[];
  voiceInput?: string;
  createdAt: string;
}

export interface AppProfile {
  id: string;
  name: string;
  description: string;
  userTypes: UserType[];
  features: Feature[];
  contextSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export type GeneratedTestCase = Omit<TestCase, 'id' | 'appProfileId' | 'voiceInput' | 'createdAt'>;
