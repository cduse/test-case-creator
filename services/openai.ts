import { AppProfile, GeneratedTestCase, TestCase } from '../types';

let _apiKey = '';

export function setApiKey(key: string) {
  _apiKey = key;
}

export function hasApiKey(): boolean {
  return _apiKey.length > 0;
}

async function openaiPost(endpoint: string, body: object): Promise<any> {
  if (!_apiKey) throw new Error('OpenAI API key not configured. Go to Settings to add your key.');

  const response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${_apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `API error: ${response.status}`);
  }

  return response.json();
}

export async function transcribeAudio(audioUri: string): Promise<string> {
  if (!_apiKey) throw new Error('OpenAI API key not configured. Go to Settings to add your key.');

  const formData = new FormData();
  formData.append('file', { uri: audioUri, type: 'audio/m4a', name: 'recording.m4a' } as any);
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${_apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? 'Transcription failed');
  }

  const data = await response.json();
  return data.text as string;
}

function buildSystemPrompt(profile: AppProfile): string {
  const userTypesText = profile.userTypes.length > 0
    ? profile.userTypes.map(ut => `- **${ut.name}**: ${ut.description}`).join('\n')
    : 'No specific user types defined.';

  const featuresText = profile.features.length > 0
    ? profile.features.map(f => {
        let text = `### ${f.name}\n${f.description}`;
        if (f.steps.length > 0) {
          text += `\nKey Flow:\n${f.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`;
        }
        return text;
      }).join('\n\n')
    : 'No features defined.';

  return `You are an expert QA engineer creating structured test cases for mobile apps, with output also consumed by automation engineers.

## APP: ${profile.name}
${profile.description}

## USER TYPES
${userTypesText}

## FEATURES & FLOWS
${featuresText}

${profile.contextSummary ? `## QA CONTEXT SUMMARY\n${profile.contextSummary}` : ''}

## INSTRUCTIONS
When the tester describes a scenario, you must:
1. Identify the feature(s) being tested
2. Identify the user type if mentioned or implied (e.g. "prestige user" means that user type's specific flow)
3. Include ALL prerequisite steps starting from the app launch or login screen — never assume the tester is already inside the app or on any particular screen
4. For each user type, account for their unique UI/flow differences described above
5. Generate atomic, executable test steps — each step must be a single, concrete UI action (tap, enter text, swipe, etc.)
6. Each step needs a precise expected result AND an automationHint (suggested UI interaction for a test automation framework — e.g. "tap element with text 'Buy Airtime'", "assert text 'Success' is visible", "enter '50' in the amount input field")
7. **CRITICAL — Expand every state into steps:** Whenever a feature description or a key flow mentions a state (e.g. "user is logged in", "user is on the buy airtime screen", "cart has items", "account has sufficient balance"), you MUST replace that state with the explicit sequence of actions required to reach it. Never write a step like "Ensure user is logged in" or "Navigate to the checkout page" — instead write each individual tap and input needed to get there from scratch.
8. Assume the tester has ZERO prior knowledge of the app's navigation, layout, or terminology. Every step must be self-contained and unambiguous to a first-time user.
9. Identify all test data requirements (accounts, amounts, products, etc.) the automation team will need to provision
10. Assign a priority (critical/high/medium/low) based on the business impact of the feature
11. Assign a testType (regression/smoke/sanity/functional/negative)

**Example of WRONG steps (states, not actions):**
- "Ensure the user is logged in"
- "User is on the Buy Airtime screen"
- "Cart contains at least one item"

**Example of CORRECT steps (concrete actions from scratch):**
- "Launch the app and wait for the login screen to appear" → App displays email and password fields
- "Enter registered email address in the Email field" → Email field shows the entered address
- "Enter password in the Password field" → Password field shows masked characters
- "Tap the 'Log In' button" → App navigates to the home screen
- "Tap the 'Airtime' option in the bottom navigation" → Buy Airtime screen opens showing denomination options

Return ONLY a valid JSON object with this exact structure:
{
  "title": "Concise test case title",
  "description": "What this test case validates",
  "userType": "User type name or null",
  "feature": "Main feature being tested",
  "priority": "critical | high | medium | low",
  "testType": "regression | smoke | sanity | functional | negative",
  "preconditions": ["Each precondition as a string"],
  "steps": [
    {
      "order": 1,
      "action": "Exact action the tester performs",
      "expectedResult": "What should happen after this action",
      "automationHint": "Suggested automation interaction, e.g. tap(byText('Buy Airtime'))"
    }
  ],
  "expectedResult": "Overall expected outcome of the test",
  "dataRequirements": [
    {
      "type": "account | amount | product | configuration | network | other",
      "description": "What data is needed",
      "example": "Concrete example value or null"
    }
  ],
  "tags": ["tag1", "tag2"]
}`;
}

function parseGeneratedCase(c: any): GeneratedTestCase {
  return {
    title: c.title ?? 'Untitled Test Case',
    description: c.description ?? '',
    userType: c.userType ?? undefined,
    feature: c.feature ?? '',
    priority: ['critical', 'high', 'medium', 'low'].includes(c.priority) ? c.priority : 'medium',
    testType: ['regression', 'smoke', 'sanity', 'functional', 'negative'].includes(c.testType) ? c.testType : 'regression',
    preconditions: Array.isArray(c.preconditions) ? c.preconditions : [],
    steps: Array.isArray(c.steps)
      ? c.steps.map((s: any, i: number) => ({
          order: typeof s.order === 'number' ? s.order : i + 1,
          action: s.action ?? '',
          expectedResult: s.expectedResult ?? '',
          automationHint: s.automationHint ?? undefined,
        }))
      : [],
    expectedResult: c.expectedResult ?? '',
    dataRequirements: Array.isArray(c.dataRequirements)
      ? c.dataRequirements.map((d: any) => ({
          type: d.type ?? 'other',
          description: d.description ?? '',
          example: d.example ?? undefined,
        }))
      : [],
    tags: Array.isArray(c.tags) ? c.tags : [],
  };
}

export async function generateTestCases(
  transcript: string,
  profile: AppProfile
): Promise<GeneratedTestCase[]> {
  const data = await openaiPost('chat/completions', {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: buildSystemPrompt(profile) },
      {
        role: 'user',
        content: `Analyse this description and determine if it covers multiple distinct test scenarios (e.g. "send momo, buy airtime and buy data" = 3 separate test cases).
If it covers multiple scenarios, generate one complete test case per scenario.
If it covers a single scenario, generate exactly one test case.

Description: "${transcript}"

Return a JSON object with a "testCases" array (even if there is only one):
{ "testCases": [ { ...test case object... }, ... ] }`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const root = JSON.parse(data.choices[0].message.content);
  const cases: any[] = Array.isArray(root.testCases) ? root.testCases : [root];
  return cases.map(parseGeneratedCase);
}

export async function parseFeatureFromTranscript(
  transcript: string
): Promise<{ description: string; steps: string[] }> {
  if (!hasApiKey()) {
    // Fallback: basic heuristic split without AI
    const lines = transcript.split(/[\n.!?]+/).map(l => l.trim()).filter(Boolean);
    const stepKeywords = /^(step\s*\d|first|second|third|then|next|after|finally|\d+[\)\.:])/i;
    const stepLines = lines.filter(l => stepKeywords.test(l));
    if (stepLines.length >= 2) {
      const firstStepIdx = lines.findIndex(l => stepKeywords.test(l));
      const description = lines.slice(0, Math.max(1, firstStepIdx)).join('. ');
      return { description: description || transcript, steps: stepLines };
    }
    return { description: transcript, steps: [] };
  }

  const data = await openaiPost('chat/completions', {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a QA assistant helping structure feature descriptions for a mobile app test suite.
Given a voice transcript, extract:
1. A full feature description that preserves every detail the user mentioned — behaviors, conditions, restrictions, edge cases, user type differences, error handling, validation rules, anything. Do NOT summarise or shorten. If the user said something specific, keep it verbatim or very close to verbatim. The description is the primary reference for test case generation, so completeness is critical.
2. Key flow steps — every user action mentioned, in order, written as concrete UI actions a first-time user could follow.

Rules for steps:
- Each step must be a single, concrete action (tap, enter, swipe, select) — not a state or assumption
- Never write steps like "user is logged in" or "navigate to screen X" — instead write what the user taps to get there
- If the transcript implies a starting state (e.g. "from the home screen"), include the steps to reach that state from the app launch
- Assume zero prior knowledge of the app

Return ONLY valid JSON: { "description": "...", "steps": ["step 1", "step 2", ...] }
If no clear steps were described, return steps as an empty array.`,
      },
      { role: 'user', content: `Transcript: "${transcript}"` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  try {
    const result = JSON.parse(data.choices[0].message.content);
    return {
      description: result.description ?? transcript,
      steps: Array.isArray(result.steps) ? result.steps : [],
    };
  } catch {
    return { description: transcript, steps: [] };
  }
}

export async function mergeFeatureDescription(
  existingDescription: string,
  update: string
): Promise<string> {
  const data = await openaiPost('chat/completions', {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a QA assistant updating a feature description for a mobile app.
Given the existing description and an update (describing a change or addition), produce the final merged description.
Rules:
- PRESERVE every detail from the existing description that the update does not contradict — do not shorten, compress, or summarise existing content
- If the update adds new information: incorporate it fully, keeping all wording and specifics intact
- If the update contradicts or supersedes a specific part of the existing description: replace ONLY that part with the new information, leaving all other details untouched
- The merged description must be at least as detailed as the existing one, and longer if the update adds new information
- Return ONLY the final merged description text, no preamble or quotes`,
      },
      {
        role: 'user',
        content: `Existing description: "${existingDescription}"

Update: "${update}"

Merged description:`,
      },
    ],
    temperature: 0.2,
  });
  return (data.choices[0].message.content as string).trim();
}

export async function refineTestCase(
  testCase: TestCase,
  profile: AppProfile,
  changeDescription: string,
  userComment?: string
): Promise<GeneratedTestCase> {
  const data = await openaiPost('chat/completions', {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: buildSystemPrompt(profile) },
      {
        role: 'user',
        content: `Refine the following test case based on changes that occurred in the app.

EXISTING TEST CASE:
Title: ${testCase.title}
Description: ${testCase.description}
Feature: ${testCase.feature}
User Type: ${testCase.userType ?? 'None'}
Priority: ${testCase.priority}
Test Type: ${testCase.testType}
Preconditions: ${testCase.preconditions.join('; ') || 'None'}
Steps:
${testCase.steps.map(s => `${s.order}. ${s.action} → ${s.expectedResult}`).join('\n')}
Expected Result: ${testCase.expectedResult}

WHAT CHANGED:
${changeDescription}

${userComment ? `REVIEWER NOTES:\n${userComment}\n` : ''}
Update only the parts of the test case affected by these changes. Keep the same title, scope, and structure unless the changes require modifying them. Return a single complete JSON object using the same schema as test case generation.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const root = JSON.parse(data.choices[0].message.content);
  return parseGeneratedCase(root);
}

export async function generateContextSummary(profile: Omit<AppProfile, 'contextSummary'>): Promise<string> {
  const userTypesText = profile.userTypes.map(ut => `- ${ut.name}: ${ut.description}`).join('\n');
  const featuresText = profile.features.map(f => {
    let text = `- ${f.name}: ${f.description}`;
    if (f.steps.length > 0) text += ` [Flow: ${f.steps.join(' → ')}]`;
    return text;
  }).join('\n');

  const data = await openaiPost('chat/completions', {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert QA engineer. Analyze the app profile and produce a comprehensive QA context document.
This document is prepended to every test case generation prompt — its purpose is to give the test case generator a complete, detailed understanding of the app so it can write accurate, thorough test cases. Completeness is more important than brevity.

Cover ALL of the following, preserving every specific detail provided:
- For each user type: exactly how their experience differs from other user types — specific UI differences, different flows, restricted or additional features, different permissions, different data, different screens. Do not generalise.
- For each feature: any constraints, validation rules, limits, error states, special conditions, and dependencies on other features or user states that were described. Include every behavioral detail mentioned.
- Which features depend on or interact with each other, and the exact nature of those dependencies
- Critical navigation paths — the full sequence of actions needed to reach each feature from a cold app launch, including any login or onboarding steps
- Any edge cases, known quirks, or conditions that affect how test steps should be written

Do not summarise or compress the input. If the user described something specifically, capture it specifically. Use structured sections with headers for readability but do not sacrifice detail for brevity.`,
      },
      {
        role: 'user',
        content: `App: ${profile.name}
Description: ${profile.description}

User Types:
${userTypesText || 'None specified'}

Features:
${featuresText || 'None specified'}`,
      },
    ],
    temperature: 0.3,
  });

  return data.choices[0].message.content as string;
}
