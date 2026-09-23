# NodeRel Ontology v1 examples

This directory defines a **project-specific, simplified ontology format** for NodeRel. The English [specification](../docs/ontology.md) describes its meaning and boundaries.

| File | Purpose |
|---|---|
| [schema.json](schema.json) | JSON Schema Draft 2020-12 for checking the structure of an ontology document |
| [movies.json](movies.json) | Three concepts, including the broader `CreativeWork` concept, and all six Movies relationship types |
| [northwind.json](northwind.json) | Five concepts and all four Northwind relationship types |

Each profile separates `concepts` and `relations` from optional data `constraints`. The `format` value identifies the syntax (`noderel-ontology/1`), while `version` identifies the author's revision of the particular profile.

These are authored definitions, rather than descriptions inferred from a database. They can declare concepts with no current data, as the Movies profile does for `CreativeWork`. The [existing AI schema export](../examples/ai/schema.json) is an observed description and is not automatically combined with these files.

## Validation boundaries

A Draft 2020-12 JSON Schema validator can check each profile against the local `schema.json`. For example, with the optional Python `jsonschema` package available, run from the repository root:

```python
import json
from pathlib import Path
from jsonschema import Draft202012Validator

schema = json.loads(Path('ontologies/schema.json').read_text())
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema)
for name in ('movies', 'northwind'):
    definition = json.loads(Path(f'ontologies/{name}.json').read_text())
    validator.validate(definition)
    print(f'{name}: document structure is valid')
```

This checks structure only. Reference integrity, hierarchy cycles, and conformance of a graph require the additional checks defined in the specification. The example files were also checked against the committed snapshots when authored.

The Python package is only an optional documentation-validation tool; NodeRel's core runtime still has no external npm dependencies.

## Runtime status

NodeRel currently does not load or enforce ontology files. Existing imports and queries are unchanged. A profile must not be advertised as active validation, automatic query expansion, or a reasoning engine merely because this directory exists.

This format does not claim OWL, SHACL, RDF, or JSON-LD conformance. Only the document-structure schema uses JSON Schema. A future standard mapping or runtime integration should state its supported capabilities separately.
