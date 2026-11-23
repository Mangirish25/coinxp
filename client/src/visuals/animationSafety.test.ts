// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flameBands } from './visuals.config';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

const maximumFlashesPerSecond = 3;
const minimumRepeatingCycleMs = 1000 / maximumFlashesPerSecond;

describe('Part 10 repeating visual motion safety', () => {
  it('keeps repeating CSS motion cycles below the three-per-second flashing threshold', () => {
    const repeatingAnimations = [...styles.matchAll(/animation:\s*([^;]*\binfinite[^;]*);/g)]
      .map(([, declaration]) => declaration?.trim() ?? '');

    expect(repeatingAnimations.length).toBeGreaterThanOrEqual(8);
    for (const declaration of repeatingAnimations) {
      const duration = declaration.match(/\b(\d+(?:\.\d+)?)(ms|s)\b/);
      if (!duration) {
        expect(declaration).toContain('var(--flame-duration)');
        continue;
      }

      const durationMs = Number(duration[1]) * (duration[2] === 's' ? 1000 : 1);
      expect(durationMs).toBeGreaterThanOrEqual(minimumRepeatingCycleMs);
    }
  });

  it('keeps every data-driven flame flicker cycle above the same minimum', () => {
    for (const band of flameBands) {
      expect(band.flickerMs).toBeGreaterThanOrEqual(minimumRepeatingCycleMs);
    }
  });
});
