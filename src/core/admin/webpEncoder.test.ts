import { describe, expect, it } from 'vitest';
import { browserWebpEncoder } from './webpEncoder';

// jsdom has no canvas and no createImageBitmap, which is exactly the "browser cannot do it" case: the encoder must answer
// null and never throw. Real pixels are checked by the owner in P10 T11.
describe('browserWebpEncoder', () => {
  it('answers null, and never throws, where there is no canvas support', async () => {
    await expect(browserWebpEncoder(new Uint8Array([1, 2, 3]), 'image/png', 800, 0.8)).resolves.toBeNull();
  });
});
