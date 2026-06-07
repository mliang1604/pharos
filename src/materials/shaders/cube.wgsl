// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,  // required: the clip-space position of the vertex
  @location(0) fragUV: vec2<f32>,             // extra: interpolated UV coordinates to pass to the fragment shader
  @location(1) worldPosition: vec3<f32>,
  @location(2) worldNormal: vec3<f32>,
};

struct PerFrame {
  viewProjection: mat4x4<f32>,
  cameraPosition: vec3<f32>,
  shininess: f32,
  lightDirection: vec3<f32>,
  ambient: f32,
  lightColor: vec3<f32>,
  specularStrength: f32,
}

struct PerObject {
  model: mat4x4<f32>,    
  normalMatrix: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> frame: PerFrame;
@group(0) @binding(1) var<uniform> object: PerObject;
@group(0) @binding(2) var cubeTexture: texture_2d<f32>;
@group(0) @binding(3) var cubeSampler: sampler;

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> VertexOutput {
  var output: VertexOutput;
  let worldPosition = object.model * vec4<f32>(position, 1.0);
  output.clipPosition = frame.viewProjection * worldPosition;
  output.worldPosition = worldPosition.xyz;
  output.worldNormal = normalize((object.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
  output.fragUV = uv;
  return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let N = normalize(in.worldNormal); // Blinn-Phong math
  let L = normalize(frame.lightDirection);
  let V = normalize(frame.cameraPosition - in.worldPosition);
  let H = normalize(L + V);

  let ambient = frame.ambient;
  let diffuse = max(dot(N, L), 0.0);
  let specular = frame.specularStrength * pow(max(dot(N, H), 0.0), frame.shininess);

  let baseColor = textureSample(cubeTexture, cubeSampler, in.fragUV).rgb;
  let color = (ambient + diffuse) * frame.lightColor * baseColor + specular * frame.lightColor;
  return vec4<f32>(color, 1.0);
}