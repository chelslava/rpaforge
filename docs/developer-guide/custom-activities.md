# Custom Activities (sub-diagram packaging)

Turn a finished sub-diagram into a first-class, shareable activity.
Introduced in v0.8.0 (issue #851). A packaged activity is a plain
`rpaforge.libraries` entry-point package whose single activity executes the
bundled sub-diagram through the native runtime — installed custom activities
load identically to built-in ones (palette, dispatch, sandbox, policies)
with zero engine changes.

## Variable contract

A sub-diagram's contract is derived (`derive_contract`) and confirmed by the
user before packaging:

- **outputs** — every activity `output_variable` written inside the
  sub-diagram; after execution they are read from the run's final variable
  state and mapped into the activity result dict.
- **inputs** — identifiers referenced by expressions/conditions that are
  never assigned or pre-declared as diagram variables (proposed; the user
  confirms name/type/default: `string | integer | number | boolean`).

At call time inputs are seeded as process variables
(`process.set_variable`), so bare-identifier references inside the
sub-diagram's activities resolve to the passed values.

## Packaging

```bash
rpaforge build-activity \
  --diagram subdiagram.process \
  --name "Invoice Runner" \
  --activity "Run Invoice" \
  --description "Processes one invoice" \
  --input customer:string="" --input amount:number=0 \
  --output total \
  --out dist/
```

This generates an installable project:

```
invoice_runner/
├── pyproject.toml          # rpaforge.libraries entry point
├── src/invoice_runner/
│   ├── library.py          # generated wrapper (native execution)
│   ├── diagram.json        # bundled sub-diagram
│   └── __init__.py
├── tests/test_library.py
├── README.md
└── LICENSE
```

Install locally with `pip install -e dist/invoice_runner` (or build a wheel
and publish it); the Studio palette picks the library up on the next bridge
refresh, and `.forge` packaging can wrap the same project for distribution
(`ForgePackageBuilder`, see `rpaforge.packaging`).

## Generated wrapper

The wrapper executes the bundled diagram through
`DiagramConverter` → `Process` → `StudioEngine.run()`:

```python
@library(name="InvoiceRunner", category="Custom")
class InvoiceRunner:
    @activity(name="Run Invoice", category="Custom")
    @param("customer", type="string", description="Input customer.")
    @param("amount", type="number", description="Input amount.")
    def run_invoice(self, customer: str = "", amount: float = 0.0) -> dict[str, Any]:
        diagram = json.loads(_DIAGRAM_PATH.read_text(encoding="utf-8"))
        process = DiagramConverter().convert(diagram)
        process.set_variable("customer", customer)
        process.set_variable("amount", amount)
        engine = StudioEngine()
        result = engine.run(process)
        if not result.passed:
            raise RuntimeError(f"sub-diagram failed: {result.message}")
        return {"total": result.variables.get("total")}
```

Generated sources pass the repo gates: ruff format/check, mypy
(`--ignore-missing-imports`), and the library-source sandbox
(`ImportWhitelistChecker` — json/pathlib/typing only, no `os`/`sys`/`subprocess`).
Both gates are asserted by tests (`tests/test_activity_builder.py`), which
also run the acceptance round-trip: package → register on a real
`ProcessExecutor` → execute → outputs mapped from the run's final variables.

## Studio flow

- **Extract as sub-diagram**: select nodes in the Designer → *Extract as
  sub-diagram* — the selection moves into a new sub-diagram file and the
  selection site becomes a `sub-diagram-call` block with the derived
  parameter/return mapping (editable before confirm).
- **Package as activity**: a sub-diagram's context menu in the Diagram
  Explorer → *Package as activity* — the contract dialog previews
  inputs/outputs, then the generated project is written via the bridge.

## Notes and limitations

- The packaged activity runs its sub-diagram through the native runtime;
  nested `sub-diagram-call` blocks inside the packaged diagram are skipped
  by the converter (same as ordinary native runs today) — inline the logic
  before packaging.
- Assign blocks seed static values at conversion time; runtime variable
  mutation inside the sub-diagram comes from activity `output_variable`
  writes.
- Versioning: the package version is declared in the generated
  `pyproject.toml`; update flow reuses the standard library update sync.
