import { parentPort } from 'node:worker_threads';
import { openGraph, TYPES } from './common.mjs';
const graph = openGraph(), started = performance.now();
const projection = graph.project({ scope: 'paradise', types: TYPES });
const buildMs = performance.now() - started;
graph.close();
global.gc?.();
parentPort.on('message', ({ p }) => {
 try {
  const started = performance.now();
  const value = projection.traceStats({ id: p.id, direction: 'both', maxDepth: 6 });
  parentPort.postMessage({ value, executionMs: performance.now() - started });
 } catch (error) { parentPort.postMessage({ error: error.stack }); }
});
parentPort.postMessage({ ready: true, buildMs, info: projection.info });
