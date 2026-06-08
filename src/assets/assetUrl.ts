// Copyright (c) 2026 Michael Liang
// SPDX-License-Identifier: MIT

export function assetUrl(path: string, base = import.meta.env.BASE_URL): string {
  const strippedPath = path.replace(/^\/+/, '');
  return `${base}${strippedPath}`;
}
