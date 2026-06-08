// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

struct Uniforms {
  mvp: mat4x4<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) normal: vec3<f32>,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VertexOutput {
  var output: VertexOutput;
  output.clipPosition = u.mvp * vec4<f32>(position, 1.0);
  output.normal = normal;
  return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(in.normal * 0.5 + 0.5, 1.0);
}