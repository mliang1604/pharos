// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

export class Texture {
  public readonly texture: GPUTexture;
  public readonly sampler: GPUSampler;

  static DEFAULT_SAMPLER: GPUSamplerDescriptor = {
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  };

  private constructor(texture: GPUTexture, sampler: GPUSampler) {
    this.texture = texture;
    this.sampler = sampler;
  }

  static fromImageBitmap(
    device: GPUDevice,
    bitmap: ImageBitmap,
    samplerDesc: GPUSamplerDescriptor,
    flipY: boolean,
    label?: string
  ): Texture {
    const mipLevelCount = Math.floor(Math.log2(Math.max(bitmap.width, bitmap.height))) + 1;
    const format = 'rgba8unorm-srgb';

    const texture = device.createTexture({
      ...(label && { label }),
      size: [bitmap.width, bitmap.height],
      format: format,
      mipLevelCount,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture({ source: bitmap, flipY }, { texture }, [
      bitmap.width,
      bitmap.height,
    ]);

    const sampler = device.createSampler(samplerDesc);

    Texture.generateMipmaps(device, texture, format, mipLevelCount);
    return new Texture(texture, sampler);
  }

  static async load(device: GPUDevice, url: string, label?: string): Promise<Texture> {
    const resource = await fetch(url);

    if (!resource.ok) {
      throw new Error(`Failed to load texture ${url}: ${resource.status}`);
    }

    const bitmap = await createImageBitmap(await resource.blob(), { colorSpaceConversion: 'none' });
    const samplerDesc = {
      ...(label && { label }),
      ...Texture.DEFAULT_SAMPLER,
    };
    return Texture.fromImageBitmap(device, bitmap, samplerDesc, true, label);
  }

  private static generateMipmaps(
    device: GPUDevice,
    texture: GPUTexture,
    format: GPUTextureFormat,
    mipLevelCount: number
  ) {
    const BLIT_WGSL = /* wgsl */ `
      @group(0) @binding(0) var src: texture_2d<f32>;
      @group(0) @binding(1) var samp: sampler;
      struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
      @vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
        var p = array(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
        var out: VSOut;
        out.pos = vec4f(p[i], 0, 1);
        out.uv = p[i] * vec2f(0.5, -0.5) + vec2f(0.5);
        return out;
      }
      @fragment fn fs(in: VSOut) -> @location(0) vec4f {
        return textureSample(src, samp, in.uv);
      }
    `;

    const module = device.createShaderModule({ code: BLIT_WGSL });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    });

    const blitSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    const encoder = device.createCommandEncoder({ label: 'mipmap gen' });

    for (let i = 1; i < mipLevelCount; i++) {
      const srcView = texture.createView({ baseMipLevel: i - 1, mipLevelCount: 1 });
      const dstView = texture.createView({ baseMipLevel: i, mipLevelCount: 1 });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: blitSampler },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: dstView, loadOp: 'clear', storeOp: 'store' }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
  }
}
