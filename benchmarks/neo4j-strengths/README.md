# Reproducing the NodeRel / Neo4j traversal experiment

This benchmark tests workloads where graph-specific execution can matter: bounded shortest distance, paths avoiding inactive nodes, broad reachability, and concurrent reads. It compares recursive SQL, separate custom SQLite traversal code, and Neo4j Cypher over Bolt.

Read the [report](REPORT.md), [raw measurements](results.json), and [query plans](query-plans.json). The custom BFS is benchmark code, not the implementation of the public `NodeRel.trace()` API.

## Recorded environment

- Node.js 24.13.1 with built-in SQLite 3.51.2.
- Neo4j Community 2025.06.2 and Java 21.
- Official `neo4j-driver` 5.28.3, pinned by `package-lock.json`.
- Apple M3, eight logical CPUs, 24 GiB RAM.
- 50,000 nodes and 300,000 directed edges, seed `20260923`.

The runtime and server must be installed separately. Different versions or hardware can change plans and timings.

## Start the dedicated server

From this directory:

```sh
npm ci
python3 prepare-config.py
NEO4J_CONF="$PWD/conf" neo4j console
```

The configuration helper locates the installed Neo4j logging configuration. If needed, supply the installation explicitly:

```sh
python3 prepare-config.py --neo4j-home /path/to/neo4j
```

It creates isolated data and log directories under `server/`, a 1 GiB heap and 1 GiB page cache, and loopback-only HTTP/Bolt listeners on ports `17474` and `17687`. Authentication is disabled for this dedicated local test server. Keep it bound to loopback and use the generated benchmark configuration.

## Import and measure

In a second terminal, change to this same directory and run:

```sh
node import.mjs
node benchmark.mjs
node repeat-concurrency.mjs
```

`import.mjs` recreates the local `bench.sqlite` file and loads the matching graph into the dedicated Neo4j server. It stops if that server already contains `Bench` nodes. Once data is imported, rerun only `benchmark.mjs` to repeat the measurements against the existing graph.

`benchmark.mjs` overwrites `results.json` and `query-plans.json`. `repeat-concurrency.mjs` adds `concurrencyRepeat` to the results, rerunning the eight-client condition with SQLite measured before Neo4j. The primary run measures Neo4j first for each concurrency level. Keep a copy of the committed results if you want to compare your run with the published one.

Stop the test server with Ctrl+C in its console when finished. Generated SQLite files, server state, logs, configuration, and `dataset.json` are excluded from Git.

## How the implementation works

| File | Responsibility |
|---|---|
| [common.mjs](common.mjs) | Deterministic graph generation, independent in-memory reference, SQLite CTE/custom BFS, and Cypher |
| [schema.mjs](schema.mjs) | Shared NodeRel schema |
| [import.mjs](import.mjs) | Load the same graph into both systems; add benchmark reverse-lookup index |
| [benchmark.mjs](benchmark.mjs) | Warmup, alternating single-query measurement order, correctness checks, profiles, concurrent reads |
| [worker.mjs](worker.mjs) | Independent SQLite worker and read connection per concurrent client |
| [repeat-concurrency.mjs](repeat-concurrency.mjs) | Reverse-order repeat at eight clients |
| [prepare-config.py](prepare-config.py) | Dedicated local Neo4j configuration |

The independent reference BFS preloads the graph solely to calculate expected answers and is excluded from timings. Measured custom SQLite BFS queries adjacency indexes as it explores. It does not use a preloaded graph or a query-response cache.

## Regenerate the charts

After recording results, return to the repository root and run:

```sh
python3 -m venv /tmp/noderel-charts
/tmp/noderel-charts/bin/python -m pip install -r scripts/requirements-charts.txt
/tmp/noderel-charts/bin/python scripts/render-benchmarks.py
```

The renderer reads `results.json` and writes SVG/PNG charts under `docs/assets/`; it does not run database queries. The committed report and README describe the published run and must be reviewed if you replace its measurements.

## Interpretation

These are warm-cache, client-observed, local read measurements. SQLite is embedded and Neo4j includes Bolt transport; memory budgets are different. Concurrent runs last approximately six seconds per condition and use closed-loop clients. They do not measure production capacity, cold-cache behavior, mixed reads/writes, or every graph shape. The [report](REPORT.md) explains the workload, algorithm, and system differences behind the results.
