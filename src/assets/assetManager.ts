// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

export interface Disposable {
  dispose(): void;
}

export class AssetManager<T extends Disposable> {
  private readonly cache = new Map<string, { asset: Promise<T>; refCount: number }>();

  constructor(private readonly load: (url: string) => Promise<T>) {}

  acquire(url: string): Promise<T> {
    const cacheHit = this.cache.get(url);
    if (cacheHit !== undefined) {
      cacheHit.refCount += 1;
      return cacheHit.asset;
    }
    const entry = { asset: this.load(url), refCount: 1 };
    this.cache.set(url, entry);
    entry.asset.catch(() => {
      if (this.cache.get(url) === entry) {
        this.cache.delete(url);
      }
    });
    return entry.asset;
  }

  release(url: string): void {
    const cacheHit = this.cache.get(url);
    if (cacheHit !== undefined) {
      cacheHit.refCount -= 1;
      if (cacheHit.refCount <= 0) {
        this.cache.delete(url);
        cacheHit.asset.then((a) => a.dispose()).catch(() => {});
      }
    }
  }
}
