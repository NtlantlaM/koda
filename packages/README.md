# Future TypeScript toolchain layout

> Review decision state: **AWAITING DECISION** for all concrete choices not explicitly supplied by the user. This is a design baseline, not a frozen specification; recommendations and release deferrals are not approvals. See the ordered proposals in docs/design/open-questions.md (from the repository root).

This directory holds the toolchain. It currently contains the first executable
slice - `compiler`, `runtime` and `cli` - described in
[compiler slice 0](../docs/implementation/slice-0.md). The remaining
responsibilities below are still unimplemented, and several of them wait on
unresolved questions rather than on effort.

```text
packages/
  compiler/          Sources, lexer, parser, resolver, checker, IR, JS emitter
  diagnostics/       Shared diagnostic schema and renderers
  runtime/           Minimal generated-program support
  stdlib/            Koda signatures and standard library implementation
  cli/               Single koda command and host integration
  formatter/         Syntax-based canonical formatting
  test-runner/       Koda test discovery and execution
  package-manager/   Manifest, lockfile, local and narrow npm resolution
```

This is a responsibility map, not a requirement to publish eight independent npm packages. Begin with the minimum workspace split justified by implementation. Tests may be colocated with packages; cross-phase conformance fixtures live under the root `tests/` directory.

Production infrastructure, persistence adapters, AI tooling, and web frameworks are not compiler dependencies. See [compiler architecture](../docs/architecture/compiler.md).
