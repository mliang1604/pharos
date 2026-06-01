// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

import { VERTEX_FORMAT_SIZE, type VertexFormat } from './vertexFormats';

export function buildVertexBufferLayout(formats: VertexFormat[]): GPUVertexBufferLayout {
  const attributes: GPUVertexAttribute[] = [];

  let offset = 0;
  let arrayStride = 0;

  formats.forEach((format, index) => {
    const size = VERTEX_FORMAT_SIZE[format];

    attributes.push({
      shaderLocation: index,
      offset,
      format,
    });

    offset += size;
    arrayStride += size;
  });

  return {
    arrayStride,
    attributes,
  };
}
