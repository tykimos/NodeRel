# Visual guide

English is the default language for explanations, labels, and captions. The README includes editable Mermaid concept diagrams and high-resolution PNG images. The PNG diagrams and charts display without a diagram renderer; matching SVG files retain scalable shapes and selectable text.

## Mermaid concept diagrams

The Mermaid source lives directly in the README and renders on GitHub:

| Diagram | What it explains |
|---|---|
| [NodeRel at a glance](../README.md#noderel-at-a-glance) | How source data becomes a rebuildable SQLite graph, with query results and an observed schema; dashed arrows mark optional AI application integration. |
| [Facts and ontology](../README.md#noderel-ontology-v1) | How individual nodes and a stored relationship connect to authored concept definitions; dashed arrows map node kinds to concepts, without adding stored edges. |
| [Prepared projection](../README.md#prepared-csr-optimization-for-repeated-queries) | On-demand SQLite queries and optional prepared CSR queries, with explicit build and refresh costs. |

The diagrams explain their conventions in the surrounding text. Edit their `mermaid` blocks in the README directly. The Python renderers below generate the static assets, not these Mermaid blocks.

## Diagrams

| Diagram | What it explains | PNG | SVG |
|---|---|---|---|
| Graph basics | How one everyday fact becomes nodes, a relationship, and a property | [Image](assets/graph-basics.png) | [Vector](assets/graph-basics.svg) |
| Architecture | How snapshots become a SQLite graph and an AI-readable description | [Image](assets/architecture.png) | [Vector](assets/architecture.svg) |
| Inbound traversal | How a requirement reaches its implementing and dependent tasks | [Image](assets/inbound-traversal.png) | [Vector](assets/inbound-traversal.svg) |
| Example graphs | Movies cast relationships and the Northwind purchase pattern | [Image](assets/example-graphs.png) | [Vector](assets/example-graphs.svg) |
| AI query sequence | The handoffs among user, application, model, and NodeRel | [Image](assets/ai-query-sequence.png) | [Vector](assets/ai-query-sequence.svg) |
| Execution models | Embedded SQLite calls compared with a Neo4j server over Bolt | [Image](assets/execution-models.png) | [Vector](assets/execution-models.svg) |
| Storage model | Node records, edge records, and snapshot metadata | [Image](assets/storage-model.png) | [Vector](assets/storage-model.svg) |

### Start with one fact

The beginner diagram reads like a sentence: Keanu Reeves acted in The Matrix. The person and movie are nodes; `ACTED_IN` is the relationship; the role Neo is a property of that relationship. The [beginner introduction](../README.md#new-to-graphs-start-here) explains these terms before introducing database architecture or code.

### Architecture and application boundaries

The source data remains authoritative. An application adapter produces `nodes` and `edges`; `rebuild()` replaces the index transactionally. The schema exporter reads the actual database. The AI application uses the description to propose requests that its own execution layer validates.

Dashed boxes in the architecture and AI sequence mark external participants or application-supplied components. In the AI sequence, dashed message arrows indicate responses. It is a proposed integration sequence, not a built-in natural-language service.

### Stored arrows and traversal direction

In the inbound traversal diagram, solid arrows show stored relationships: the API task implements the requirement, and the UI task depends on the API task. Dashed arrows show the reverse traversal starting from the requirement. The result contains the two tasks with minimum depths one and two; the requirement itself is excluded.

In the example graph diagram, Keanu Reeves and Laurence Fishburne point to *The Matrix*, and their roles belong to the relationships. The Northwind panel is a type-level pattern, rather than a single order's complete data. `PURCHASED` goes from customer to order, `ORDERS` from order to product, `PART_OF` from product to category, and `SUPPLIES` from supplier to product.

### Logical references and execution boundaries

The storage diagram's connectors show how endpoint IDs refer to `items.id`. Import validation checks those references; the SQL schema does not declare foreign keys or triggers for them. The composite relationship key permits only one edge per `(from_id, to_id, type)` tuple.

The execution diagram shows the local single-query call boundaries. On-demand SQLite measurements use separate workers and read connections. The public `trace()` method defaults to recursive SQL and also supports batched BFS; `shortestDistance()` defaults to bidirectional BFS. A prepared projection compiles SQLite into an in-memory snapshot before repeated queries; each measured projection worker owns a private copy and closes its database connection after preparation. The historical synthetic benchmark's custom BFS remains a separate implementation.

## Performance charts

| Chart | Reading the chart | PNG | SVG |
|---|---|---|---|
| Prepared CSR latency | Same cases, newly measured BFS/CSR/Neo4j; CSR preparation excluded and separately reported | [Image](assets/projection-latency.png) | [Vector](assets/projection-latency.svg) |
| Prepared CSR concurrency | Same 360 requests at each client count, excluding private projection builds | [Image](assets/projection-concurrency.png) | [Vector](assets/projection-concurrency.svg) |
| Paradise Papers latency | Public NodeRel SQL/BFS versus Neo4j; separates nearby and farther shortest-distance cases | [Image](assets/paradise-latency.png) | [Vector](assets/paradise-latency.svg) |
| Paradise Papers concurrency | Same finite batch at 1/8/16 clients; two runs in reversed engine order | [Image](assets/paradise-concurrency.png) | [Vector](assets/paradise-concurrency.svg) |
| Query latency | Median milliseconds on a logarithmic scale; lower is better | [Image](assets/query-latency.png) | [Vector](assets/query-latency.svg) |
| Concurrent traversal | Completed requests per second; higher is better | [Image](assets/concurrent-throughput.png) | [Vector](assets/concurrent-throughput.svg) |

The Paradise Papers charts use the [September 24 measurements](../benchmarks/paradise-papers/results.json) and measure the public NodeRel algorithms. The [report](../benchmarks/paradise-papers/REPORT.md) explains graph normalization, case sampling, full-row timings, and the finite-batch concurrency design. Its shortest-distance chart groups pairs by independently verified distance; the overall mixed-target median and the unreachable pair remain in the report.

The earlier synthetic charts use the [September 23 measurements](../benchmarks/neo4j-strengths/results.json). Recursive SQL, the historical custom SQLite BFS, and Neo4j over Bolt are labeled separately. That throughput chart includes the reversed-order repeat at eight clients. Its [report](../benchmarks/neo4j-strengths/REPORT.md) preserves the original experiment and limitations.

The charts are measured evidence. The architecture and flow diagrams explain behavior and are not additional benchmark results.

## Rebuild the visuals

The [prepared-projection report](../benchmarks/paradise-papers/OPTIMIZATION.md) explains its separate [raw measurements](../benchmarks/paradise-papers/optimization-results.json), build time, memory observations, algorithm ablation, and fixed-snapshot semantics. Its charts compare prepared CSR queries with live database queries, not with Neo4j GDS.

Run from the repository root:

```sh
python3 -m venv /tmp/noderel-charts
/tmp/noderel-charts/bin/python -m pip install -r scripts/requirements-charts.txt
/tmp/noderel-charts/bin/python scripts/render-benchmarks.py
/tmp/noderel-charts/bin/python scripts/render-paradise.py
/tmp/noderel-charts/bin/python scripts/render-optimization.py
/tmp/noderel-charts/bin/python scripts/render-diagrams.py
```

The renderers use Matplotlib and save under `docs/assets/`. `render-paradise.py` and `render-optimization.py` also rebuild their corresponding reports from recorded measurements. No extra graph-layout tool, database server, or model call is required. NodeRel's runtime does not depend on these plotting tools.

[render-benchmarks.py](../scripts/render-benchmarks.py) reads the recorded JSON; [render-diagrams.py](../scripts/render-diagrams.py) contains the diagram labels, shapes, and layout. Edit the renderer and regenerate both formats together when the documentation changes. The diagram renderer checks for text extending outside the canvas; exported images should also be visually reviewed for readability and overlap.

Every embedded image has descriptive alternative text, and the surrounding documentation provides the query semantics and benchmark tables in text form.
