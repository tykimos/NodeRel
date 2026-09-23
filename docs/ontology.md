# NodeRel Ontology v1

**Status: draft specification. Format identifier: `noderel-ontology/1`.**

A NodeRel ontology is a small, explicit vocabulary for one graph scope. It describes what node kinds and relationship types mean, how concepts are related by a simple parent hierarchy, and which optional data checks an application wants to apply.

The format has three parts:

| Part | Question it answers | Example |
|---|---|---|
| `concepts` | What kinds of things does this graph describe? | A `Movie` is a kind of `CreativeWork`. |
| `relations` | What do the connections mean? | A `Person` `ACTED_IN` a `Movie`. |
| `constraints` | Which additional stored values should be checked? | An acting relationship must contain a `roles` array of strings. |

The vocabulary is authored deliberately. It is separate from the observed schema, which reports the kinds, edges, properties, and counts found in a particular SQLite file.

## Scope and implementation status

This repository supplies this specification, a [JSON Schema for the document structure](../ontologies/schema.json), and complete profiles for the committed [Movies](../ontologies/movies.json) and [Northwind](../ontologies/northwind.json) examples.

The current NodeRel runtime does **not** load these files automatically. `rebuild()`, `trace()`, and `describeNodeRel()` retain their existing behavior. Ontology-aware import checking, parent-aware query expansion, and combining these definitions with the AI description require a separate integration. The constraints below define the intended check semantics; publishing a definition does not activate those checks.

| Conformance claim | Status |
|---|---|
| NodeRel Ontology v1 vocabulary | Defined by this document; project-specific and experimental |
| Ontology document structure | Described using JSON Schema Draft 2020-12 |
| OWL / RDFS semantics or entailment | Not claimed |
| SHACL shapes or validation semantics | Not claimed |
| JSON-LD / RDF representation | Not claimed |
| Built-in ontology execution | Not implemented |

JSON Schema checks the structure of the JSON document. It does not make the ontology vocabulary an OWL or SHACL implementation. See the [JSON Schema specification](https://json-schema.org/draft/2020-12/json-schema-core) for that distinct role.

## A small complete definition

This illustrative profile defines one relationship type. Use [movies.json](../ontologies/movies.json) for the full Movies snapshot, which also contains directing, producing, writing, reviewing, and following relationships.

```json
{
  "format": "noderel-ontology/1",
  "id": "movie_basics",
  "version": "0.1.0",
  "scope": "movies",
  "concepts": {
    "Person": {
      "description": "A human individual.",
      "titleMeaning": "The person's display name."
    },
    "CreativeWork": {
      "description": "A created work, such as a film."
    },
    "Movie": {
      "description": "A motion picture.",
      "parent": "CreativeWork",
      "titleMeaning": "The movie title."
    }
  },
  "relations": {
    "ACTED_IN": {
      "description": "A person performed in a movie.",
      "from": "Person",
      "to": "Movie",
      "reverseLabel": "has cast member",
      "properties": {
        "roles": { "description": "Characters played in this movie." }
      }
    }
  },
  "constraints": {
    "requiredNodeFields": { "Movie": ["title"] },
    "edgeProperties": {
      "ACTED_IN": {
        "roles": { "type": "string[]", "required": true }
      }
    }
  }
}
```

The `description` of `roles` explains its meaning. The separate `constraints` entry says how its stored value should be checked. Neither entry asserts that every real-world film or acting credit follows these application-specific completeness requirements.

## Document structure

| Field | Required | Meaning |
|---|---|---|
| `$schema` | No | Editor/validator hint pointing to the ontology document schema; examples use `./schema.json`. |
| `format` | Yes | Must be exactly `noderel-ontology/1`. |
| `id` | Yes | Identifier for the authored ontology. |
| `version` | Yes | Author-managed revision written as three numeric components, for example `0.1.0`. |
| `scope` | Yes | Exact `items.scope` / `links.scope` value to which this profile applies. |
| `description` | No | Explanation of the domain and intended use. |
| `concepts` | Yes | Nonempty map of concept identifiers to definitions. |
| `relations` | Yes | Map of stored relationship types to definitions; may be empty. |
| `constraints` | No | Additional field/property requirements; omitted means none. |

Ontology IDs, concept IDs, relation IDs, and edge-property names use `[A-Za-z][A-Za-z0-9_]*` in v1. They are case-sensitive. Display labels, descriptions, aliases, and the scope value may contain Unicode. This identifier restriction belongs to this ontology format; SQLite itself can store a wider range of names.

JSON member names must be unique in the original document. Unknown fields are invalid rather than silently ignored. Consumers must reject unsupported `format` versions. A content revision does not change the meaning of the format version, and the format does not prescribe automatic version negotiation.

## Concepts

A concept key maps to a stored `items.kind`. A concept can also be declared without any current instances, as `CreativeWork` is in the Movies profile.

| Field | Meaning |
|---|---|
| `description` | Required human-readable meaning. |
| `label` | Optional display name; the concept key is used when absent. |
| `aliases` | Optional alternative terms for this concept. |
| `parent` | Optional identifier of one broader concept in this same file. |
| `titleMeaning` | Optional explanation of the current `items.title` field. |

A parent must exist, must differ from its child, and must not form a cycle. There is at most one direct parent. The hierarchy is transitive: if `Documentary` has parent `Movie`, and `Movie` has parent `CreativeWork`, a documentary is classified under all three concepts for profile interpretation.

This does not add extra labels to stored nodes. `items.kind` remains a single value. A future ontology-aware query layer can expand a request for `CreativeWork` into its declared descendants, but the existing query API does not do so.

Aliases describe vocabulary terms, not individual entities. Adding `film` as an alias for `Movie` does not resolve a person's name or a movie title to a node ID. Alias collisions are allowed and remain ambiguous; they do not merge concepts. An integrating application must not silently select a concept when a term matches several.

## Relations

A relation key maps exactly to `links.type`. Each relation has one source concept and one target concept in v1.

| Field | Meaning |
|---|---|
| `description` | Required human-readable meaning of the connection. |
| `from` | Required source concept identifier. |
| `to` | Required target concept identifier. |
| `label` | Optional readable name; the relation key is used when absent. |
| `aliases` | Optional alternative terms for this relationship type. |
| `reverseLabel` | Optional wording when reading the same edge from target to source. |
| `properties` | Optional map describing named values in `links.attrs`; each entry requires `description` and may have a `label`. |

Both endpoint concepts must be declared in the file. For a profile conformance check, an endpoint kind must equal the declared concept or be its descendant. A relation declared from `Person` to `CreativeWork` therefore permits a target whose stored kind is `Movie` when that parent relationship is declared.

`from` and `to` are local endpoint expectations. They do not infer or rewrite node kinds. If an edge has the wrong endpoint kind, it fails the profile check. This is an explicit NodeRel convention, not an adoption of OWL domain/range semantics.

`reverseLabel` adds wording only. For example, reading `ACTED_IN` backward can be described as “has cast member.” It does not create a `HAS_CAST_MEMBER` type, insert another edge, declare a symmetric relationship, or create an executable inverse operation. The existing API can read incoming `ACTED_IN` edges using `direction: 'in'`.

Property descriptions do not create SQLite columns, indexes, or values. They describe relationship JSON already supplied by the application. Original node attributes outside `items`, such as release year or product price, remain outside this format's storage contract.

## Constraints and graph conformance

This section specifies what an application would check when explicitly applying an ontology to a graph. These checks are not currently invoked by NodeRel's importer or query functions.

### Base checks

A checked graph scope must satisfy these conditions:

1. Every stored node kind in the scope is declared in `concepts`.
2. Every stored relationship type in the scope is declared in `relations`.
3. Both endpoints exist, share the edge's scope, and match its `from` / `to` concepts, including permitted descendants.
4. NodeRel's existing invariants still apply, including unique IDs, unique `(from, to, type)` tuples, and no self-reference edges accepted by `rebuild()`.

Other scopes are outside the check, but an edge in the checked scope cannot point to a node from another scope. A declared concept or relation need not have any instances. Extra relationship properties are permitted and are not treated as instructions.

An undeclared kind/type is a profile mismatch. It is not a statement that the corresponding concept or relationship cannot exist in the world. In particular, missing relationships are not interpreted as proof that a real-world fact is false.

### Required node fields

`constraints.requiredNodeFields` maps concept identifiers to nonempty lists of fixed node fields: `title`, `no`, `status`, or `updated_at`.

A required field must be a string whose value is nonempty after trimming whitespace. This matters because the current importer fills absent optional fields with empty strings. Requirements inherited from parents are combined by union: a child cannot cancel a parent's required field.

Concept references must exist. This facility cannot introduce arbitrary node properties. It does not alter how the current importer stores values.

### Relationship property checks

`constraints.edgeProperties` maps relation identifiers to property rules. Every referenced relation must exist, and each checked property must be declared in that relation's `properties` map.

A rule contains a required `type` and an optional `required` boolean. `required` defaults to false. When true, the property must be present and non-null. If a property is present, its value must match the type even when `required` is false; `null` does not match any v1 type. Empty strings and empty arrays are allowed; v1 has no minimum-length or minimum-item rules.

| Type | Accepted JSON value |
|---|---|
| `string` | String |
| `number` | Finite number |
| `integer` | Number with no fractional part |
| `boolean` | Boolean |
| `object` | Non-null JSON object, excluding arrays |
| `array` | JSON array with no item-type restriction |
| `string[]`, `number[]`, `integer[]`, `boolean[]` | Array whose every item matches the corresponding scalar type |

Values are not coerced. In the Northwind snapshot, `quantity` is an integer while `unitPrice` and `discount` are decimal strings. The profile preserves those types; it does not silently convert them into numbers.

Property rules are local to their declared relation. v1 has no relation inheritance, nested property paths, general expressions, numeric ranges, or relationship cardinality restrictions.

## Three distinct checks

| Check | What it establishes | Available here |
|---|---|---|
| Structural | Correct fields, types, required keys, and supported format identifier | JSON Schema document |
| Definition consistency | Valid references, acyclic parents, and correctly referenced constrained properties | Rules specified above; no packaged checker |
| Graph conformance | A particular dataset matches the profile and optional constraints | Rules specified above; no runtime integration |

Passing the JSON Schema alone does not prove the other two. A JSON parser must also detect duplicate member names before a parsed object loses that information. The committed examples have been checked against their corresponding snapshots, but there is no automatic validation hook in `rebuild()`.

## Use with AI

A future integration can present three separate sections to a model:

- **Declared ontology:** authored meanings, aliases, hierarchy, and expected endpoints.
- **Observed schema:** actual kinds, counts, relationship shapes, and property types from SQLite.
- **Executable operations:** only the APIs and SQL capabilities the application really exposes.

An ontology can explain that a film is a creative work. It cannot by itself make an unsupported query executable. If observed data disagrees with the definition, the application should surface the mismatch instead of silently rewriting either. Descriptions and aliases are context, not permission to execute instructions. Access controls and query budgets remain application responsibilities.

A future cache or export that combines these sources should identify the ontology `id` and `version` alongside the existing source signature. Nothing in this specification authorizes automatic ontology discovery, remote fetching, or schema merging.

## Deliberately outside v1

Multiple inheritance, logical unions/intersections, equivalent-class reasoning, inferred edges, transitive relation closure, general rule languages, RDF/OWL/SHACL import/export, SPARQL, Cypher translation, cross-file imports, and automatic entity resolution are outside this format.

For stronger interoperability or formal reasoning, an explicit mapping to a standard would be separate work. The defining references for those standards are [OWL 2](https://www.w3.org/TR/owl2-overview/) and [SHACL](https://www.w3.org/TR/shacl/); using similar words in this project does not claim conformance to them.
