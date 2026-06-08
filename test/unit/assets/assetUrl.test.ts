import { describe, it, expect } from 'vitest';
import { assetUrl } from '@/assets/assetUrl';

describe('assetUrl', () => {
  it('joins against the dev base', () => {
    expect(assetUrl('textures/uv-grid.png', '/')).toBe('/textures/uv-grid.png');
  });

  it('joins against the prod subpath base', () => {
    expect(assetUrl('textures/uv-grid.png', '/pharos/')).toBe('/pharos/textures/uv-grid.png');
  });

  it('tolerates a leading slash on the path', () => {
    expect(assetUrl('/models/Box.glb', '/pharos/')).toBe('/pharos/models/Box.glb');
  });

  it('defaults to import.meta.env.BASE_URL (/ under Vitest)', () => {
    expect(assetUrl('basis/basis_transcoder.wasm')).toBe('/basis/basis_transcoder.wasm');
  });
});
