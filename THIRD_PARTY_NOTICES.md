# Third-party sources

## Neo4j example datasets

The Movies and Northwind snapshots, sample queries, and recorded results are derived from official example resources:

- https://github.com/neo4j-graph-examples/movies
- https://github.com/neo4j-graph-examples/northwind
- https://data.neo4j.com/northwind/
- https://neo4j.com/docs/getting-started/appendix/example-data/

Exact input URLs and SHA-256 checksums are preserved in `examples/neo4j/sources.json`. Sample names, movie descriptions, and business records are source data. This repository does not assign a new license to those materials; their applicable source terms remain in effect.

## Benchmark runtime dependencies

The optional benchmark uses `neo4j-driver` 5.28.3, installed separately using its lockfile. It retains its own license. Neo4j Community and Java are installed separately. The setup script reads installed Neo4j log configuration files rather than bundling them here.

The core NodeRel and schema exporter use Node.js built-ins and require no third-party npm runtime dependencies.
