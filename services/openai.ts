import { AppProfile, GeneratedTestCase } from '../types';

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

  return `You are an expert QA engineer creating structured test cases for mobile apps.

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
3. Include ALL prerequisite steps: login, navigation to the feature, any setup required
4. For each user type, account for their unique UI/flow differences described above
5. Generate atomic, executable test steps — each step should be a single action
6. Each step needs a precise expected result
7. Infer any implicit steps the tester did not mention but are required to complete the flow

Return ONLY a valid JSON object with this exact structure:
{
  "title": "Concise test case title",
  "description": "What this test case validates",
  "userType": "User type name or null",
  "feature": "Main feature being tested",
  "preconditions": ["Each precondition as a string"],
  "steps": [
    {
      "order": 1,
      "action": "Exact action the tester performs",
      "expectedResult": "What should happen after this action"
    }
  ],
  "expectedResult": "Overall expected outcome of the test",
  "tags": ["tag1", "tag2"]
}`;
}

export async function generateTestCase(
  transcript: string,
  profile: AppProfile
): Promise<GeneratedTestCase> {
  const data = await openaiPost('chat/completions', {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: buildSystemPrompt(profile) },
      { role: 'user', content: `Generate a detailed test case for: "${transcript}"` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = JSON.parse(data.choices[0].message.content);

  return {
    title: content.title ?? 'Untitled Test Case',
    description: content.description ?? '',
    userType: content.userType ?? undefined,
    feature: content.feature ?? '',
    preconditions: Array.isArray(content.preconditions) ? content.preconditions : [],
    steps: Array.isArray(content.steps)
      ? content.steps.map((s: any, i: number) => ({
          order: typeof s.order === 'number' ? s.order : i + 1,
          action: s.action ?? '',
          expectedResult: s.expectedResult ?? '',
        }))
      : [],
    expectedResult: content.expectedResult ?? '',
    tags: Array.isArray(content.tags) ? content.tags : [],
  };
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
        content: `You are an expert QA engineer. Analyze the app profile and create a concise, structured QA context summary.
This summary will be prepended to every test case generation prompt, so focus on:
- How different user types experience the app differently (different UIs, different flows, different permissions)
- Which features interact with or depend on each other
- Critical navigation paths and prerequisite states for each feature
- Edge cases or special conditions to be aware of
Keep it under 400 words. Use clear, structured prose.`,
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
