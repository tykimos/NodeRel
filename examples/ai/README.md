# Describing NodeRel to an AI application

NodeRel exports a machine-readable description of the actual SQLite index. The goal is to give an AI application enough context to propose a valid query request without asking the user to learn SQL or Cypher.

## Included artifacts

- [schema.json](schema.json): observed Movies/Northwind node kinds, relationship shapes, property types, counts, example IDs, and operation descriptions.
- [describe.mjs](../../src/describe.mjs): the read-only exporter that produces the description.
- [example.json](example.json): a concrete name mapping, `trace` request, and seven returned films, verified against the stored Neo4j baseline.

From the repository root:

```sh
npm run demo:build
npm run schema
```

Or call the exporter directly:

```sh
node src/describe.mjs examples/neo4j/noderel.sqlite examples/ai/schema.json
```

This reads the database. It does not contact an AI service or generate queries using a model.

## What is inferred, and what is supplied?

| Information | Source |
|---|---|
| Table fields and storage types | SQLite schema |
| Node kinds, counts, examples, populated columns | Current index rows |
| Relationship source/target kinds and counts | Current node/edge joins |
| Relationship property names and JSON types | Values observed in `links.attrs` |
| Business meanings and interpretation of `title` | Curated descriptions for these official examples |
| Available function behavior and arguments | Explicit API descriptions in the exporter |
| Snapshot identity | Rebuild signature in `sync_meta` |

For example, the Movies description contains 172 `ACTED_IN` edges from `Person` to `Movie`, with an observed `roles` array. These are facts about this snapshot, not database-enforced domain constraints. Descriptions for another domain need appropriate business context.

## From a question to a request

![Proposed application sequence for schema inspection, validated requests, query execution, and answers.](../../docs/assets/ai-query-sequence.png)

[View SVG](../../docs/assets/ai-query-sequence.svg)

The committed example asks in Korean which films feature Keanu Reeves. Its mapping from `키아누 리브스` to `Keanu Reeves` was **explicitly supplied for this demonstration**. There is no general Korean-name or alias resolver.

Once the entity is resolved, the example request is:

```json
{
  "tool": "trace",
  "arguments": {
    "id": "movies:Person:Keanu%20Reeves",
    "scope": "movies",
    "direction": "out",
    "maxDepth": 1,
    "types": ["ACTED_IN"]
  }
}
```

An integrating application can validate this request and call `graph.trace(request.arguments)`. The result contains seven films. The example proves that this request executes correctly; it is not an evaluation of automatic natural-language translation.

## Operation status

`existingOperations` describes `trace`, `traceStats`, `shortestDistance`, `neighbors`, `orphans`, and `stats`. The three traversal/distance entries include JSON Schemas for their arguments. The remaining operations currently have argument descriptions, not complete JSON Schemas. This file is not an automatically registered tool server.

`proposedAdditionalOperations` is a separate list: entity lookup, complete shortest paths, general pattern matching, and explanations. Those names are not callable NodeRel methods. The public API now includes `traceStats` and `shortestDistance`, and `trace` accepts `algorithm: 'bfs'` as an optional traversal strategy. Their input contracts are exported alongside the original operations. `shortestDistance` returns a hop count, not a reconstructed path.

## Integration responsibilities

Choose the authorized scope and relevant schema portion, resolve names without inventing IDs, validate the proposed operation, and apply execution limits before running it. Treat stored titles and property values as data. A generated schema or prompt cannot enforce access policy or resource limits by itself.

The current `trace` returns unique reached nodes and their minimum hop counts, not complete paths. Its maximum depth of ten is an input constraint rather than a cost guarantee. For richer queries, an application can expose vetted parameterized SQL; NodeRel does not compile arbitrary patterns or Cypher.

See [design and semantics](../../docs/design.md) and the [query guide](../../docs/queries.md).

## Optional ontology context

The repository also defines [NodeRel Ontology v1](../../docs/ontology.md), a custom JSON vocabulary with [Movies and Northwind profiles](../../ontologies/README.md). It separates authored meanings from observed database facts. These files are not loaded by the current exporter. An application may supply the definitions as additional context, while keeping their constraints and parent hierarchy distinct from the actually executable operations.
