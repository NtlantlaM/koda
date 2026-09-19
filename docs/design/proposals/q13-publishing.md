# Q13: Package ownership and release trust

State: **AWAITING DECISION**. Selected option: **none**. No namespace or registry has been created.
Depends on Q05–Q07 and Q12. This gates release/package distribution, not the current documentation push.

## Decision and why it matters

Choose who owns the Koda package identity, where releases/packages come from, how artifacts are authenticated, and who can revoke or recover publication access. A language's package manager must not guess which similarly named package is official.

## Alternatives

| Option | Distribution model | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A | Official source repository/releases; no public Koda registry initially; add verified artifact distribution when tools exist | Small operational burden, clear authority | Less convenient dependency discovery/install UX |
| B | Official organization-scoped npm toolchain packages with provenance and controlled publishing | Existing delivery infrastructure, fits Node bootstrap | npm namespace/account policies become dependencies |
| C | Dedicated Koda registry with delegated namespace ownership and signed metadata | Full language-specific policy/control | Major operational, recovery, security, and governance commitment |

No option changes the accepted goal of one Koda package manager; these concern its delivery and trust sources.

## Established ecosystems

| Language | Approach |
| --- | --- |
| Rust | Cargo/crates.io defines package publication and ownership workflows. [Publishing](https://doc.rust-lang.org/cargo/reference/publishing.html) |
| Kotlin | Gradle configuration specifies repositories and dependencies; Kotlin does not require inventing a new universal registry for its language grammar. [Gradle setup](https://kotlinlang.org/docs/gradle-configure-project.html) |
| Swift | SwiftPM describes package dependencies through package URLs/version requirements, separating package identity from language syntax. [PackageDescription](https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html) |
| TypeScript | npm organization scopes group package ownership; provenance can link a published package to its build origin. These are ecosystem mechanisms, not TypeScript semantics. [Scopes](https://docs.npmjs.com/about-organization-scopes-and-packages/), [provenance](https://docs.npmjs.com/generating-provenance-statements/) |
| Go | Module authentication uses checksums and a checksum database for applicable public modules, rather than assuming a download is trustworthy. [Module authentication](https://go.dev/ref/mod#authenticating) |
| Python | PyPI trusted publishing exchanges CI identity for short-lived publication credentials. [Trusted publishers](https://docs.pypi.org/trusted-publishers/) |

## Effects

| Dimension | A | B | C |
| --- | --- | --- | --- |
| Beginners | Clear source origin, more manual setup | Familiar npm install experience | Unified experience if operated well |
| AI-generated code | Official URLs are explicit | Must use correct scope/version | Must understand new registry identifiers |
| Compiler complexity | None directly | None directly; package integration work | None in checker, substantial package/service work |
| Runtime performance | No intrinsic change | No intrinsic change | Download/cache behavior changes, not semantics |
| Interoperability | Minimal distribution coupling | Best Node ecosystem fit | Bridges to npm and other registries required |
| Compatibility | Easy to add delivery channels later | Namespace/artifact names become sticky | Registry metadata/trust policy becomes long-lived |

## Recommendation, not acceptance

Recommend **A** during design, then deliberately consider **B** for the first executable toolchain release. This is a staged proposal, not authorization to claim a namespace or publish packages.

| Subchoice (AWAITING DECISION) | Alternatives and tradeoff | Recommended candidate |
| --- | --- | --- |
| Ownership | Personal account: quick; project organization: shared; foundation: heavier | Project organization with named maintainers before artifact publishing; verify availability separately |
| Credentials | Long-lived token: simple/risk; short-lived trusted CI: scoped; manual signing only: human burden | Trusted CI identity where supported, restricted release workflow |
| Authentication | Checksums only: integrity not origin; signed tags/artifacts: identity/key care; provenance attestations: build linkage | Checksums plus authenticated release provenance; choose signing identities and verification UX before artifacts |
| Version immutability | Replace versions: easy/unsafe cache; immutable versions: reproducible; revocation/yank: explicit compromise handling | Immutable published versions plus documented revocation policy |
| Recovery | Single owner: simple/brittle; multiple maintainers: resilient; council-held keys: heavier | At least two authorized maintainers with tested recovery and access-removal rules |
| Registry moderation | None: cheap/abuse risk; central policy: accountable; delegated scopes: scalable | Defer dedicated registry; choose dispute/malware/namespace-transfer policies before launching one |

Provenance does not establish that package code is correct or harmless. No signing keys, accounts, CI publication workflows, release tags, or package-manager code are introduced by this review.
