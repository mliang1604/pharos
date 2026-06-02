import { describe, expect, it } from 'vitest';
import { buildVertexBufferLayout } from '@/geometry/vertexLayout';

describe('buildVertexBufferLayout', () => {
  it('builds a vertex buffer layout for a single format', () => {
    const layout = buildVertexBufferLayout(['float32x3']);
    expect(layout).toEqual({
      arrayStride: 12,
      attributes: [
        {
          shaderLocation: 0,
          offset: 0,
          format: 'float32x3',
        },
      ],
    });
  });

  it('builds a vertex buffer layout for multiple formats', () => {
    const layout = buildVertexBufferLayout(['float32x3', 'float32x2']);
    expect(layout).toEqual({
      arrayStride: 20,
      attributes: [
        {
          shaderLocation: 0,
          offset: 0,
          format: 'float32x3',
        },
        {
          shaderLocation: 1,
          offset: 12,
          format: 'float32x2',
        },
      ],
    });
  });

  it('builds an empty vertex buffer layout for no formats', () => {
    const layout = buildVertexBufferLayout([]);
    expect(layout).toEqual({
      arrayStride: 0,
      attributes: [],
    });
  });
});
