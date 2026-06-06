// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,  // required: the clip-space position of the vertex
  @location(0) fragUV: vec2<f32>,             // extra: interpolated UV coordinates to pass to the fragment shader
  @location(1) worldPosition: vec3<f32>,
  @location(2) worldNormal: vec3<f32>,
};

struct Uniforms {
  model: mat4x4<f32>,           // bytes   0–63
  viewProjection: mat4x4<f32>,  //        64–127
  normalMatrix: mat4x4<f32>,    //       128–191   (mat4, not mat3, on purpose)
  cameraPosition: vec3<f32>,    //       192–203
  shininess: f32,               //       204–207   ← packed into cameraPosition's slot
  lightDirection: vec3<f32>,    //       208–219
  ambient: f32,                 //       220–223   ← packed
  lightColor: vec3<f32>,        //       224–235
  specularStrength: f32,        //       236–239   ← packed
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var cubeTexture: texture_2d<f32>;
@group(0) @binding(2) var cubeSampler: sampler;

@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> VertexOutput {
  var output: VertexOutput;
  let worldPosition = u.model * vec4<f32>(position, 1.0);
  output.clipPosition = u.viewProjection * worldPosition;
  output.worldPosition = worldPosition.xyz;
  output.worldNormal = normalize((u.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
  output.fragUV = uv;
  return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let N = normalize(in.worldNormal); // Blinn-Phong math
  let L = normalize(u.lightDirection);
  let V = normalize(u.cameraPosition - in.worldPosition);
  let H = normalize(L + V);

  let ambient = u.ambient;
  let diffuse = max(dot(N, L), 0.0);
  let specular = u.specularStrength * pow(max(dot(N, H), 0.0), u.shininess);

  let baseColor = textureSample(cubeTexture, cubeSampler, in.fragUV).rgb;
  let color = (ambient + diffuse) * u.lightColor * baseColor + specular * u.lightColor;
  return vec4<f32>(color, 1.0);
}