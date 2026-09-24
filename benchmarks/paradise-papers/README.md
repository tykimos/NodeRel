# Reproducing the Paradise Papers comparison

This experiment compares the public NodeRel APIs using recursive SQL or additional BFS algorithms with equivalent Neo4j Cypher queries. It uses the official [Neo4j ICIJ Paradise Papers example](https://github.com/neo4j-graph-examples/icij-paradise-papers), pinned to commit `76438607087f42986c80b61b681a48c151f7f39e`.

Read the [results and interpretation](REPORT.md), [source provenance](sources.json), [selected cases](cases.json), and [raw measurements](results.json). The older [synthetic experiment](../neo4j-strengths/REPORT.md) is a separate run with separate code and results.

## Dataset and projection

The source has 163,414 nodes and 364,456 relationships. NodeRel allows one relationship per `(from, to, type)` tuple. The exporter collapses 52,531 repeated tuples in original relationship-ID order, leaving **163,414 nodes and 311,925 relationships in both measured databases**. There were no self-loops. Both systems retain the same normalized topology; Neo4j is not timed on the larger source multigraph.

The measured queries traverse `OFFICER_OF`, `INTERMEDIARY_OF`, and `REGISTERED_ADDRESS` in either direction, following the official guide's connection-investigation pattern. These three types contain 300,963 normalized relationships. Duplicate collapse preserves the reached-node sets and minimum hop counts tested here. It does not preserve multiplicity or all relationship-property variants, so this is not an evaluation of those queries.

Original node labels become the `kind` field. Both databases contain identical `id`, `kind`, `scope`, and `title` values; original node attributes remain in the uncommitted source snapshot. Neo4j uses a common `Paradise` label for indexed ID lookup and original relationship types. Relationship properties are retained as JSON text in both stores. The queries do not filter on arbitrary source node properties or relationship attributes.

The source includes records of real people and organizations. Inclusion in ICIJ data does not imply wrongdoing. This benchmark uses opaque dump-record IDs, performs no identity resolution, and does not publish the full snapshot in this repository.

## 1. Extract the pinned source dump

The official repository supplies a Neo4j 4.3 dump. Use a separate **Neo4j Community 4.4.48 / Java 11** installation to load and export it; this older server is used only for extraction, never for performance measurement. Download the pinned file:

```sh
curl -fL -o paradise-43.dump https://raw.githubusercontent.com/neo4j-graph-examples/icij-paradise-papers/76438607087f42986c80b61b681a48c151f7f39e/data/icij-paradise-papers-43.dump
shasum -a 256 paradise-43.dump
```

Expected SHA-256: `eb9e80ab546783f538e544f5385bc04309d69a76bfae1fb3ce0e49d6e06b38f1`.

For that temporary installation only, enable `dbms.allow_upgrade=true`, disable authentication, and bind its Bolt listener to `127.0.0.1:18687`. Keep its data/log directories separate from any existing database. With the temporary server stopped, load it using that installation's `neo4j-admin`:

```sh
neo4j-admin load --from=/absolute/path/paradise-43.dump --database=neo4j
neo4j console
```

In a second terminal, run from `benchmarks/paradise-papers`:

```sh
npm ci
node export-source.mjs /absolute/path/paradise-43.dump
```

This creates ignored `dataset.json` and writes `sources.json`. Override `SOURCE_BOLT` only if using another isolated extraction port. Stop the extraction server before measuring anything.

## 2. Prepare the measured databases

Use **Node.js 25.6.0 (SQLite 3.53.4), Neo4j Community 2025.06.2, Java 21**, and the pinned JavaScript driver 5.28.3 to reproduce the recorded environment. The dataset's historical dump format does not dictate the measured Neo4j version. The earlier synthetic experiment used Node 24.13.1 and SQLite 3.51.2, so compare implementations within each experiment rather than treating the two datasets as one controlled run.

From this directory:

```sh
python3 prepare-config.py
NEO4J_CONF="$PWD/conf" neo4j console
```

The helper creates a separate server under `server/`, binds HTTP/Bolt to loopback ports 17474/17687, disables authentication, and assigns a 1 GiB heap and 1 GiB page cache. Use this configuration only for the isolated local benchmark.

In another terminal:

```sh
node import.mjs
node --input-type=module -e "import { generateCases } from './common.mjs'; generateCases();"
node --expose-gc benchmark.mjs
node balanced-concurrency.mjs
```

The importer refuses to overwrite an existing SQLite file or a nonempty target Neo4j database. The benchmark refuses to overwrite `results.json`. Preserve the committed results elsewhere before an intentional rerun. Generated databases, server files, logs, and the snapshot are ignored by Git. `import-results.json` records setup durations; those are not optimized bulk-import benchmarks.

## Measurement contract

- **Inputs:** six seeded sources in each of three distinct-neighbor degree groups: 1, 2–4, and at least 5. The 2,411 zero-degree nodes are reported but excluded from source sampling. This is a stratified sample, not a traffic-weighted random workload.
- **Targets:** alternate nearby (1–2 hops), farther (5–10 hops), and uniformly random graph-wide records. The generator specifies its fallback for an empty distance band. No cases are selected by measured speed.
- **Single requests:** 4/6/8-hop reached-node count and depth sum, and shortest distance bounded at ten hops. Two rounds per source, rotating implementation order. All raw observations and degree-group summaries are retained. Medians use the upper middle observation for even sample counts; p95 uses zero-based sorted index `ceil(n * 0.95) - 1`.
- **Warmup:** three NodeRel calls and eighteen Neo4j calls per workload, rotating one source from each degree group. The extra Neo4j warmup allows server/JIT preparation; import and initial connectivity are excluded. These are warm-cache measurements.
- **Full results:** all nodes and normalized edges are compared before timing; full reached records are checked on three sources. Equal full-row materialization and transfer is measured separately from the main scalar workloads.
- **Concurrency:** NodeRel BFS versus Neo4j with 1, 8, and 16 clients, two rounds per level, reversing engine order. The main script records ten-second arrival windows. The follow-up script records the same fixed 36 requests for both engines, exactly two per case, so differing completion rates cannot change the case mix. The headline charts use this balanced finite-batch comparison. Both drain in-flight work. Each SQLite client has its own worker and connection; each Neo4j client has a Bolt session. Startup is excluded, but worker message overhead is included. Neither experiment establishes steady-state service capacity.
- **Algorithms:** SQL uses the actual `traceStats`/`shortestDistance` APIs with `algorithm: 'sql'`. BFS uses the same APIs with `algorithm: 'bfs'`; no full adjacency preload, CSR projection, result cache, or extra benchmark-only SQLite indexes are used. The independent in-memory reference is for correctness only and is released before measurement.
- **Limits:** the data can benefit from OS caches, and memory budgets are not identical. A single SQLite connection is configured for up to 64 MiB of page cache; multiple workers multiply that allowance. Client times include local Bolt overhead for Neo4j. This is a short desktop read experiment, not a sustained production-capacity test.

The SQL baseline explores the full bounded neighborhood even for a nearby target, while bidirectional BFS and Neo4j shortest-path operators can stop earlier. Their distance outputs are equal; their work is intentionally different. Reachability queries do not enumerate every path.

## Files

| File | Purpose |
|---|---|
| `export-source.mjs` | Export the pinned dump and normalize the same topology for both engines |
| `import.mjs` | Populate the measured stores and prepare Neo4j's unique ID index |
| `common.mjs` | Query definitions, deterministic cases, and independent reference BFS |
| `benchmark.mjs` | Correctness checks, timings, concurrency repeats, and query plans |
| `balanced-concurrency.mjs` | Follow-up throughput check with exactly the same case counts per engine |
| `worker.mjs` | One synchronous NodeRel reader per concurrent client |
| `probe.mjs` | Optional exploratory checks; not the published measurements |
| `prepare-config.py` | Isolated measured-server configuration |

Render the published figures with `python3 scripts/render-paradise.py` from the repository root. It reads `results.json`; it does not rerun queries. Stop the measured server after the experiment.
