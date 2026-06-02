// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,  // required: the clip-space position of the vertex
  @location(0) fragUV: vec2<f32>,             // extra: interpolated UV coordinates to pass to the fragment shader
};

@group(0) @binding(0) var<uniform> mvpMatrix: mat4x4<f32>;
@group(0) @binding(1) var cubeTexture: texture_2d<f32>;
@group(0) @binding(2) var cubeSampler: sampler;

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> VertexOutput {
  var output: VertexOutput;
  output.clipPosition = mvpMatrix * vec4<f32>(position, 1.0);
  output.fragUV = uv;
  return output;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(cubeTexture, cubeSampler, uv);
}