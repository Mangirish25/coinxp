import { describe, expect, it } from 'vitest';
import { contrastRatio, themeTokens } from './themeTokens';

describe('Part 9 themes',()=>{
  it('keeps readable text and brand controls at WCAG AA contrast',()=>{
    for(const theme of Object.values(themeTokens)){
      expect(contrastRatio(theme.ink900,theme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.ink500,theme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.brand700,theme.canvas)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
