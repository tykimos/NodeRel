# Movies and Northwind correctness report

Recorded: `2026-09-23T04:06:59.063Z`. All **15 queries matched** the results recorded from Neo4j.

## Dataset fidelity

| Dataset | Nodes | Relationships | Indexed fields and edge properties |
|---|---:|---:|---|
| Movies | 171 | 253 | All matched |
| Northwind | 1,035 | 3,139 | All matched |

No relationships were discarded during import. Original node properties that are not part of the index remain in the source snapshots.

## Query results

The English labels below follow the order of [cases.mjs](cases.mjs). Korean case labels in the historical JSON and fixtures are retained as stable identifiers. Row counts count returned rows; the minimum-distance query returns one row containing depth **4**.

| # | Question | Rows | Result |
|---:|---|---:|---|
| 1 | Films featuring Keanu Reeves | 7 | Matched |
| 2 | The Matrix cast and roles | 5 | Matched |
| 3 | Tom Hanks co-actors | 34 | Matched |
| 4 | People who directed and acted in the same movie | 3 | Matched |
| 5 | Four-hop undirected reachability from Keanu Reeves | 57 | Matched |
| 6 | Minimum distance from Keanu Reeves to Tom Hanks | 1 | Matched |
| 7 | People without an ACTED_IN relationship | 31 | Matched |
| 8 | Products in the Dairy Products category | 10 | Matched |
| 9 | Products and categories supplied by supplier 1 | 3 | Matched |
| 10 | ALFKI purchased products and order counts | 11 | Matched |
| 11 | Categories purchased by ALFKI | 5 | Matched |
| 12 | Customers who bought products from supplier 1 | 49 | Matched |
| 13 | Customers without orders | 2 | Matched |
| 14 | Three-hop downstream reachability from ALFKI | 22 | Matched |
| 15 | Product quantities in order 10248 | 3 | Matched |

For full returned values, query text, and parameters, see [results.json](results.json). [expected-results.json](expected-results.json) supplies the baseline used by current offline tests.

## Additional checks

The recorded regression checks passed:

- Cycles and substring-like node IDs still return correct minimum depths.
- A start node from a different scope does not expose its neighborhood.
- Invalid depth inputs are rejected.
- Invalid rebuild input preserves the previous index.

The root `npm test` also checks the exported schema, the concrete AI request/result pair, and SQLite integrity. It rebuilds from the snapshots in a temporary directory and does not require a running Neo4j server.

## Historical small-sample timings

These timings are retained for provenance, separate from the larger [Bolt benchmark](../../benchmarks/neo4j-strengths/REPORT.md). They used one client, three warmups, and eleven measured calls per query. SQLite ran in process; Neo4j used local HTTP with reused connections and JSON transport. All numbers below are median milliseconds, including result handling.

Environment: Apple M3, Node 24.13.1, SQLite 3.51.2, Neo4j Community 2025.06.2, Neo4j heap 512 MiB and page cache 256 MiB.

| # | Question | SQLite ms | Neo4j HTTP ms |
|---:|---|---:|---:|
| 1 | Films featuring Keanu Reeves | 0.006 | 6.166 |
| 2 | The Matrix cast and roles | 0.011 | 3.101 |
| 3 | Tom Hanks co-actors | 0.026 | 2.967 |
| 4 | People who directed and acted in the same movie | 0.125 | 4.525 |
| 5 | Four-hop undirected reachability from Keanu Reeves | 0.829 | 4.302 |
| 6 | Minimum distance from Keanu Reeves to Tom Hanks | 1.894 | 3.312 |
| 7 | People without an ACTED_IN relationship | 0.068 | 3.068 |
| 8 | Products in the Dairy Products category | 0.007 | 2.206 |
| 9 | Products and categories supplied by supplier 1 | 0.005 | 3.250 |
| 10 | ALFKI purchased products and order counts | 0.015 | 1.938 |
| 11 | Categories purchased by ALFKI | 0.010 | 1.850 |
| 12 | Customers who bought products from supplier 1 | 0.124 | 2.422 |
| 13 | Customers without orders | 0.047 | 1.809 |
| 14 | Three-hop downstream reachability from ALFKI | 0.185 | 2.394 |
| 15 | Product quantities in order 10248 | 0.005 | 2.220 |

The tiny datasets and transport difference dominate some comparisons. These results do not isolate database-engine speed, establish concurrent throughput, or show that NodeRel replaces all Cypher functionality. Use the separate traversal experiment for the broader workload comparison.

## Reproduction and provenance

Run `npm run demo:build` and `npm run demo -- test` from the repository root to check current SQLite output against the stored baseline. This reproduces the SQLite correctness check, not a fresh live Neo4j measurement.

The project was renamed after the original measurements. Comparison metadata in displayed Cypher now uses `NodeRelItem`, `noderel_id`, and `noderel_scope`; the historical run used the earlier metadata names. Renaming these annotations did not rerun the experiment or change its numeric measurements.

See [sample instructions](README.md), [data sources and checksums](sources.json), and [third-party notices](../../THIRD_PARTY_NOTICES.md).
