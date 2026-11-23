import type { CoreDto, HabitDetailDto } from '@notch/shared';
import { expect } from 'vitest';
import type { TestClient } from './test-client.js';

export async function createCore(
  client: TestClient,
  overrides: Partial<{ name: string; color: string; icon: string }> = {},
): Promise<CoreDto> {
  const res = await client.post('/cores', {
    name: 'Health',
    color: 'emerald',
    icon: 'heart-pulse',
    ...overrides,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as CoreDto;
}

export async function createHabit(
  client: TestClient,
  coreId: string,
  overrides: Record<string, unknown> = {},
): Promise<HabitDetailDto> {
  const res = await client.post('/habits', {
    coreId,
    name: 'Read',
    type: 'COUNT',
    unit: 'pages',
    targetValue: 20,
    scheduleType: 'DAILY',
    ...overrides,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as HabitDetailDto;
}
