import { describe, it, expect, vi, type Mock } from 'vitest';
import { AssetManager, type Disposable } from '@/assets/assetManager';

interface FakeAsset extends Disposable {
  readonly url: string;
  readonly dispose: Mock<() => void>;
}

// A loader that records every call and hands back a fresh disposable per URL.
// `flush()` drains the microtask + macrotask queue so deferred dispose()
// callbacks (scheduled inside release via `asset.then(...)`) have run.
function makeLoader() {
  const calls: string[] = [];
  const load = vi.fn((url: string): Promise<FakeAsset> => {
    calls.push(url);
    return Promise.resolve({ url, dispose: vi.fn<() => void>() });
  });
  return { load, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AssetManager', () => {
  it('loads a URL once and dedups concurrent acquires', async () => {
    const { load, calls } = makeLoader();
    const manager = new AssetManager(load);

    const a = manager.acquire('tex://a');
    const b = manager.acquire('tex://a');

    expect(await a).toBe(await b);
    expect(calls).toEqual(['tex://a']);
  });

  it('keeps the asset alive while any reference remains', async () => {
    const { load } = makeLoader();
    const manager = new AssetManager(load);

    void manager.acquire('tex://a');
    void manager.acquire('tex://a');
    const asset = await manager.acquire('tex://a');

    manager.release('tex://a');
    manager.release('tex://a');
    await flush();

    expect(asset.dispose).not.toHaveBeenCalled();
  });

  it('disposes exactly once when the last reference is released', async () => {
    const { load } = makeLoader();
    const manager = new AssetManager(load);

    const asset = await manager.acquire('tex://a');
    manager.release('tex://a');
    await flush();

    expect(asset.dispose).toHaveBeenCalledTimes(1);
  });

  it('reloads after a URL has been fully released', async () => {
    const { load, calls } = makeLoader();
    const manager = new AssetManager(load);

    const first = await manager.acquire('tex://a');
    manager.release('tex://a');
    await flush();

    const second = await manager.acquire('tex://a');

    expect(calls).toEqual(['tex://a', 'tex://a']);
    expect(second).not.toBe(first);
  });

  it('evicts a failed load so a later acquire retries with a fresh load', async () => {
    let attempt = 0;
    const load = vi.fn((url: string): Promise<FakeAsset> => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error('boom'));
      return Promise.resolve({ url, dispose: vi.fn<() => void>() });
    });
    const manager = new AssetManager(load);

    await expect(manager.acquire('tex://a')).rejects.toThrow('boom');
    await flush();

    const asset = await manager.acquire('tex://a');
    expect(asset.url).toBe('tex://a');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ignores release of an unknown URL', () => {
    const { load } = makeLoader();
    const manager = new AssetManager(load);

    expect(() => manager.release('tex://never-acquired')).not.toThrow();
  });
});
