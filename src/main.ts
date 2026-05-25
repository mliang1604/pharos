const canvas = document.querySelector<HTMLCanvasElement>('#app');

if (!canvas) {
  throw new Error('Could not find #app canvas element in index.html');
}

const ctx = canvas.getContext('2d');
if (ctx) {
  ctx.fillStyle = '#d7dade';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('Pharos — Phase 0 skeleton is alive.', 24, 40);
}

console.info('[pharos] skeleton booted');
