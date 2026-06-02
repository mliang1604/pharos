// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

export class Shader {
  public readonly vertexEntryPoint: string;
  public readonly fragmentEntryPoint: string;
  public readonly shaderModule: GPUShaderModule;

  constructor({
    device,
    code,
    label,
    vertexEntryPoint = 'vs_main',
    fragmentEntryPoint = 'fs_main',
  }: {
    device: GPUDevice;
    code: string;
    label?: string;
    vertexEntryPoint?: string;
    fragmentEntryPoint?: string;
  }) {
    this.vertexEntryPoint = vertexEntryPoint;
    this.fragmentEntryPoint = fragmentEntryPoint;

    const descriptor: GPUShaderModuleDescriptor = { code, ...(label && { label }) };

    this.shaderModule = device.createShaderModule(descriptor);
  }
}
