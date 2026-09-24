# Third-party sources

## Neo4j example datasets

The Movies and Northwind snapshots, sample queries, and recorded results are derived from official example resources:

- https://github.com/neo4j-graph-examples/movies
- https://github.com/neo4j-graph-examples/northwind
- https://data.neo4j.com/northwind/
- https://neo4j.com/docs/getting-started/appendix/example-data/

Exact input URLs and SHA-256 checksums are preserved in `examples/neo4j/sources.json`. Sample names, movie descriptions, and business records are source data. This repository does not assign a new license to those materials; their applicable source terms remain in effect.

## Paradise Papers benchmark source

The Paradise Papers follow-up uses the official [Neo4j ICIJ Paradise Papers example](https://github.com/neo4j-graph-examples/icij-paradise-papers), derived from [ICIJ's Offshore Leaks Database](https://offshoreleaks.icij.org/). The pinned dump URL, commit, checksums, and normalized counts are recorded in `benchmarks/paradise-papers/sources.json`. The full dump and exported source records are not redistributed here. Source terms continue to apply; this repository does not grant a new license for them. Inclusion in the source data does not imply wrongdoing.

## Benchmark runtime dependencies

The optional benchmarks use `neo4j-driver` 5.28.3, installed separately using their lockfiles. It retains its own license. Neo4j Community and Java are installed separately. The setup scripts read installed Neo4j log configuration files rather than bundling them here.

The core NodeRel and schema exporter use Node.js built-ins and require no third-party npm runtime dependencies.
