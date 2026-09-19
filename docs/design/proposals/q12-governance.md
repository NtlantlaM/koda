# Q12: License and contribution governance

State: **AWAITING DECISION**. Selected options: **none**.
These were unnumbered questions in the original index. They can be discussed in parallel with language design. No license, contributor agreement, or governance body is adopted here.

## Decisions and why they matter

Choose (1) the license for compiler/runtime/stdlib/docs/examples and (2) who can approve language changes and on what contribution terms. An intention to be open source does not itself grant reuse rights; a language proposal also needs an explicit acceptance authority.

## License alternatives

| Option | Advantages | Disadvantages |
| --- | --- | --- |
| L1: MIT | Short permissive terms, familiar reuse | No express patent grant comparable to Apache's provisions |
| L2: Apache-2.0 | Permissive with explicit patent grant/termination terms | More notice/compliance text |
| L3: MPL-2.0 | File-level source-sharing obligations for covered modifications | More distribution/compliance complexity than permissive choices |

These descriptions summarize the actual license texts, not additional terms for Koda. [MIT](https://opensource.org/license/mit), [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0), [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/)

## Governance alternatives

| Option | Advantages | Disadvantages |
| --- | --- | --- |
| G1: Named maintainer decides after public proposal/review | Clear early accountability and fast decisions | Concentrated authority; needs succession rules |
| G2: Small elected/appointed council with documented voting | Shared accountability and resilience | Premature process overhead for a small project |
| G3: Consensus among active contributors with escalation process | Broad participation | Deadlocks and unclear membership without careful rules |

## Established project approaches

These are project policies, not language semantics.

| Language | Licensing/governance precedent |
| --- | --- |
| Rust | Primarily MIT/Apache dual licensing; substantial changes use RFC review. [Licenses](https://rust-lang.org/policies/licenses/), [RFC process](https://github.com/rust-lang/rfcs/blob/master/README.md) |
| Kotlin | Repository license is Apache-2.0; the Language Committee has published guidelines. [License](https://github.com/JetBrains/kotlin/blob/master/license/LICENSE.txt), [committee](https://kotlinfoundation.org/language-committee-guidelines/) |
| Swift | Apache-2.0 with Runtime Library Exception; Swift Evolution supplies proposal review. [License](https://www.swift.org/legal/license.html), [evolution](https://www.swift.org/swift-evolution/) |
| TypeScript | Apache-2.0; documented project contribution/design processes. [License](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt), [contributing](https://github.com/microsoft/TypeScript/blob/main/CONTRIBUTING.md) |
| Go | BSD-style license; public design proposal process. [License](https://go.dev/LICENSE), [proposals](https://go.dev/s/proposal) |
| Python | PSF licensing terms; PEP 13 defines steering-council governance. [License](https://docs.python.org/3/license.html), [PEP 13](https://peps.python.org/pep-0013/) |

## Effects

| Dimension | License choices L1/L2/L3 | Governance choices G1/G2/G3 |
| --- | --- | --- |
| Beginners | L1 shortest; L2 more text; L3 contribution/distribution distinctions | G1 clearest contact; G2 formal route; G3 membership harder to understand |
| AI-generated code | All require provenance/attribution care; none makes generated copying automatically licensed | G1 clear approver; G2 structured review; G3 ambiguous acceptance unless documented |
| Compiler complexity | No direct implementation effect | No direct algorithmic effect; review process affects change cost |
| Runtime performance | No direct execution effect | No direct execution effect |
| Interoperability | L1/L2 easier redistribution; L3 may require covered-source handling | G1 fast integration decisions; G2 shared review; G3 possible delays |
| Compatibility | Relicensing existing contributions can be difficult under all choices | G1 needs succession; G2 needs voting stability; G3 needs deadlock rules |

## Recommendation, not acceptance

Recommend **L2 and G1** initially: explicit permissive patent terms and a named accountable maintainer with public proposal records. This is a proposal, not permission to add a LICENSE or claim user approval.

Additional choices, all **AWAITING DECISION**:

| Subchoice | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Component licenses | One license: simple; runtime exception: distribution nuance; separate docs license: more administration | One Apache-2.0 policy initially, explicitly including examples/docs; evaluate whether a runtime exception is needed before runtime distribution |
| Contribution terms | Inbound=outbound certification: light; DCO sign-off: traceable; CLA: more rights/admin | Simple documented inbound=outbound policy and contributor authority certification; choose DCO/CLA only for a concrete need |
| Acceptance record | Informal merge: quick; explicit ADR approval: traceable; council vote: shared | Named approver/date/rationale in ADR; silence never counts |
| Succession | Sole indefinite owner: simple; named backup: resilience; immediate council: heavier | Named backup and documented transfer process |

Generated user programs are not automatically relicensed wholesale by using a compiler; distributed runtime components can carry their own notice obligations. Resolve that packaging contract before release. Publishing this design discussion is not adoption of its proposed legal terms.
