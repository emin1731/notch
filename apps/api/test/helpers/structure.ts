import type { CoreDto, GoalDetailDto } from '@notch/shared';
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

export async function createGoal(
  client: TestClient,
  coreId: string,
  overrides: Record<string, unknown> = {},
): Promise<GoalDetailDto> {
  const res = await client.post('/goals', { coreId, title: 'Run a marathon', ...overrides });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as GoalDetailDto;
}
