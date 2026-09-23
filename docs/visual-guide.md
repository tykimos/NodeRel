# Visual guide

English is the default language for explanations, labels, and captions. The README embeds high-resolution PNG images so that charts and diagrams display without a diagram renderer. Matching SVG files retain scalable shapes and selectable text.

## Diagrams

| Diagram | What it explains | PNG | SVG |
|---|---|---|---|
| Architecture | How snapshots become a SQLite graph and an AI-readable description | [Image](assets/architecture.png) | [Vector](assets/architecture.svg) |
| Inbound traversal | How a requirement reaches its implementing and dependent tasks | [Image](assets/inbound-traversal.png) | [Vector](assets/inbound-traversal.svg) |
| Example graphs | Movies cast relationships and the Northwind purchase pattern | [Image](assets/example-graphs.png) | [Vector](assets/example-graphs.svg) |
| AI query sequence | The handoffs among user, application, model, and NodeRel | [Image](assets/ai-query-sequence.png) | [Vector](assets/ai-query-sequence.svg) |
| Execution models | Embedded SQLite calls compared with a Neo4j server over Bolt | [Image](assets/execution-models.png) | [Vector](assets/execution-models.svg) |
| Storage model | Node records, edge records, and snapshot metadata | [Image](assets/storage-model.png) | [Vector](assets/storage-model.svg) |

### Architecture and application boundaries

The source data remains authoritative. An application adapter produces `nodes` and `edges`; `rebuild()` replaces the index transactionally. The schema exporter reads the actual database. The AI application uses the description to propose requests that its own execution layer validates.

Dashed boxes in the architecture and AI sequence mark external participants or application-supplied components. In the AI sequence, dashed message arrows indicate responses. It is a proposed integration sequence, not a built-in natural-language service.

### Stored arrows and traversal direction

In the inbound traversal diagram, solid arrows show stored relationships: the API task implements the requirement, and the UI task depends on the API task. Dashed arrows show the reverse traversal starting from the requirement. The result contains the two tasks with minimum depths one and two; the requirement itself is excluded.

In the example graph diagram, Keanu Reeves and Laurence Fishburne point to *The Matrix*, and their roles belong to the relationships. The Northwind panel is a type-level pattern, rather than a single order's complete data. `PURCHASED` goes from customer to order, `ORDERS` from order to product, `PART_OF` from product to category, and `SUPPLIES` from supplier to product.

### Logical references and execution boundaries

The storage diagram's connectors show how endpoint IDs refer to `items.id`. Import validation checks those references; the SQL schema does not declare foreign keys or triggers for them. The composite relationship key permits only one edge per `(from_id, to_id, type)` tuple.

The execution diagram shows the local single-query call boundaries. Concurrent SQLite measurements use separate workers and read connections. Specialized SQLite BFS remains benchmark-only; the public `trace()` method uses recursive SQL.

## Performance charts

| Chart | Reading the chart | PNG | SVG |
|---|---|---|---|
| Query latency | Median milliseconds on a logarithmic scale; lower is better | [Image](assets/query-latency.png) | [Vector](assets/query-latency.svg) |
| Concurrent traversal | Completed requests per second; higher is better | [Image](assets/concurrent-throughput.png) | [Vector](assets/concurrent-throughput.svg) |

The charts use the committed [recorded measurements](../benchmarks/neo4j-strengths/results.json). Recursive SQL, custom SQLite BFS, and Neo4j over Bolt are labeled separately. The throughput chart includes the reversed-order repeat at eight clients. Consult the [report](../benchmarks/neo4j-strengths/REPORT.md) for numeric tables, p95 latency, environment, and interpretation.

The charts are measured evidence. The architecture and flow diagrams explain behavior and are not additional benchmark results.

## Rebuild the visuals

Run from the repository root:

```sh
python3 -m venv /tmp/noderel-charts
/tmp/noderel-charts/bin/python -m pip install -r scripts/requirements-charts.txt
/tmp/noderel-charts/bin/python scripts/render-benchmarks.py
/tmp/noderel-charts/bin/python scripts/render-diagrams.py
```

Both renderers use Matplotlib and save under `docs/assets/`. No extra graph-layout tool, database server, or model call is required. NodeRel's runtime does not depend on these plotting tools.

[render-benchmarks.py](../scripts/render-benchmarks.py) reads the recorded JSON; [render-diagrams.py](../scripts/render-diagrams.py) contains the diagram labels, shapes, and layout. Edit the renderer and regenerate both formats together when the documentation changes. The diagram renderer checks for text extending outside the canvas; exported images should also be visually reviewed for readability and overlap.

Every embedded image has descriptive alternative text, and the surrounding documentation provides the query semantics and benchmark tables in text form.
