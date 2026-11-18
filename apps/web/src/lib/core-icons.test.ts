import { CORE_PRESETS } from '@notch/shared';
import { Circle } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { CORE_ICONS, coreIcon, searchCoreIcons } from './core-icons';

describe('core icons', () => {
  it('include every preset icon, each name once', () => {
    const names = CORE_ICONS.map((option) => option.name);
    expect(new Set(names).size).toBe(names.length);
    for (const preset of CORE_PRESETS) {
      expect(names).toContain(preset.icon);
    }
  });

  it('fall back to a circle for a name outside the set', () => {
    expect(coreIcon('rocket')).toBe(Circle);
  });

  it('search names, labels and keywords, every word', () => {
    expect(searchCoreIcons('sleep').map((option) => option.name)).toEqual(['bed', 'moon']);
    expect(searchCoreIcons('MONEY savings').map((option) => option.name)).toEqual(['piggy-bank']);
    expect(searchCoreIcons('  ')).toHaveLength(CORE_ICONS.length);
    expect(searchCoreIcons('zzz')).toEqual([]);
  });
});
