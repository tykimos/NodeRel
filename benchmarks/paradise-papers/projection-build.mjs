// Run in a fresh process to keep build/retained-memory observations separate.
import { resourceUsage } from 'node:process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openGraph, TYPES } from './common.mjs';
const graph = openGraph();
global.gc?.();
const before = process.memoryUsage(), started = performance.now();
const projection = graph.project({ scope: 'paradise', types: TYPES });
const buildMs = performance.now() - started, afterBuild = process.memoryUsage();
global.gc?.();
const retained = process.memoryUsage();
const firstCase = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url))).cases[0];
const firstStarted = performance.now();
const value = projection.traceStats({ id: firstCase.id, direction: 'both', maxDepth: 6 });
const firstQueryMs = performance.now() - firstStarted;
assert.deepEqual(value, firstCase.expected.reach6);
console.log(JSON.stringify({ buildMs, before, afterBuild, retained, maxRSSKiB: resourceUsage().maxRSS, info: projection.info, firstQueryMs, value }));
projection.close(); graph.close();
