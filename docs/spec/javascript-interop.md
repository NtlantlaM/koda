# JavaScript and npm interoperability

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

Status: **ACCEPTED** explicit typed interoperability; declaration syntax, value conversions, and npm install mechanism **EXPERIMENTAL**, pending Q06.

Koda's type system remains authoritative within Koda. JavaScript runtime behavior and TypeScript declaration files are not sufficient evidence that a foreign value is safe. Foreign declarations are trust boundaries whose assumptions must be visible and validated where possible.

## Proposed v0.1 boundary

The initial backend emits JavaScript ES modules for Node.js. Narrow interop to explicitly declared, synchronous named-export functions taking and returning supported primitive values. Module location and exported name must be declared, not inferred from arbitrary property access. Promise values, callbacks, classes, mutable object graphs, CommonJS adaptation, and automatic `.d.ts` ingestion are LATER.

Proposed declaration notation, not `.ko` grammar yet:

```text
foreign module "npm:example-library" {
    fn normalize(value: String) -> Result<String, ForeignError>
}
```

This describes an adapter around a JavaScript function. It does not claim that the JavaScript function itself returns a Koda `Result`. The actual declaration file format, module binding syntax, and error representation are Q06. A runnable npm example is deferred until those decisions are frozen.

## Conversion requirements

| Boundary value | Required policy |
| --- | --- |
| `String`, `Bool` | Validate runtime primitive kind; never coerce |
| `Int` | Validate kind and chosen integer range |
| `Float` | Validate kind and the chosen non-finite policy |
| `T?` | Explicit `null` mapping; `undefined` requires a declared conversion |
| Records, enums, entities | No raw object casting; explicit future codecs |
| `Result` | Koda adapter constructs a result; no shape guessing |
| JavaScript exception | Convert to declared foreign failure at the adapter boundary |
| Promise or unsupported object | Reject unsupported signature/value in v0.1 |

Candidate policy: every foreign call returns a `Result`, including runtime conversion failures and caught JavaScript throws. Catch non-Error thrown values as well. Module-loading failures need the same visible failure policy or a documented fatal initialization error; Q06 must settle that distinction. Do not erase unexpected failure by returning a default.

Outbound Koda values must obey an explicit ABI. Record/enum representations are private runtime details, not contracts for npm users. Future mutable foreign objects must not masquerade as immutable Koda values.

## Dependency and runtime policy

Pin resolved package versions and integrity in the Koda lockfile. Builds should consume installed locked dependencies; dependency resolution must not silently run during `check`. Lifecycle scripts require an explicit policy and remain outside the initial subset. Decide whether the CLI delegates npm installation or supplies its own resolver before implementing package commands; do not build an accidental npm reimplementation.

The supported Node version and module-loading rules will be pinned at Stage 0. No version claim is made in this design-only repository. Interoperability does not imply sandboxing: npm code runs with the application's process privileges.
