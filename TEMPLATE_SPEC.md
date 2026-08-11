# ggaction-template Specification

## 1. Purpose

ggaction-template is a specification-driven repository template for building
ggaction extension packages with LLM agents.

A living specification defines the intended public behavior. Agents use it to
implement, verify, and evolve the package while keeping its code, types, tests,
examples, and documentation aligned.

## 2. Workflow

1. Initialize a ggaction extension repository from the template.
2. The user and an LLM agent complete the living specification together.
3. Implementation begins after the required product and architecture decisions
   are resolved.
4. The agent implements the extension according to the specification.
5. Automated verification evaluates whether the specification, public API,
   types, contracts, tests, examples, and documentation remain aligned.
6. Future public behavior changes update the specification and implementation
   together.

## 3. Generated Repository

An initialized repository must include:

- a root `AGENTS.md` that defines the specification-driven development workflow;
- a living project specification at `spec/SPEC.md`;
- structured data, feature, and decision specifications under `spec/`;
- data contracts that normalize supported external formats into one canonical
  domain representation through explicit, deterministic conversion rules;
- import-time action registration through the public `registerExtension` API
  from `ggaction/extension`;
- clear boundaries for actions, grammar, and materialization;
- synchronized JavaScript exports and TypeScript module augmentation;
- action contracts and requirement traceability;
- unit, contract, chart, and package-consumer tests;
- runnable examples and public documentation using the pinned
  `ggaction-docs-v1` compatibility profile; and
- automated verification through local commands and continuous integration.

The generated specification surface is:

```text
spec/
├─ SPEC.md
├─ data/
├─ features/
├─ decisions/
├─ _templates/
│  ├─ DATA.md
│  ├─ FEATURE.md
│  └─ DECISION.md
└─ generated/
   ├─ data-index.json
   ├─ feature-index.json
   ├─ decision-index.json
   └─ traceability.json
```

`spec/SPEC.md` owns the project-level contract and indexes the active data,
feature, and open-decision specifications. Data specifications own accepted
external formats, canonical domain representations, and deterministic
conversion rules. Feature specifications own one visualization family, its
data requirements, reused and new actions, three executable examples, and
observable acceptance criteria. Decision specifications preserve unresolved
and accepted product or architecture choices.

Files under `spec/_templates/` are authoring aids. They are not active
specifications and must be excluded from active specification indexes and
validation.

The generated documentation surface is:

```text
docs/
├─ profile.json
├─ profile-lock.json
├─ _config.yml
├─ _data/pages.yml
├─ _layouts/
├─ _includes/
├─ _sass/docs/
├─ assets/
├─ _generated/
│  └─ examples/
├─ _templates/
│  ├─ RECIPE.md
│  ├─ TUTORIAL.md
│  └─ API.md
├─ index.md
├─ getting-started.md
├─ tutorials/
├─ recipes/
├─ gallery/
├─ concepts/
├─ api/
├─ reference/
├─ supported-features.md
└─ troubleshooting.md
```

`ggaction-docs-v1` is a deterministic, repository-local snapshot of the
ggaction documentation shell pinned to an exact upstream commit. Generation and
verification must not fetch a mutable GitHub branch or require network access.
The profile preserves the compatible Jekyll layout, navigation model,
components, styling, search, LLM metadata, responsive behavior, and
accessibility conventions. Package branding may vary, but shared profile files
must not diverge silently.

`docs/profile.json` selects the profile and its version. Package branding comes
from `package.json`, not a duplicated documentation setting. The generated
`docs/profile-lock.json` records the pinned upstream source, protected roots,
and sorted SHA-256 hashes for every profile-owned file. It may change only
during initialization or an explicit profile upgrade. `_data/pages.yml` is the
single navigation source. Files under `docs/_templates/` are authoring aids and
must be excluded from navigation, search, and LLM-facing output.

Files under `docs/_generated/` are deterministic documentation inputs and
metadata. In particular, `docs/_generated/examples/<feature>/program.js` is a
generated mirror of the canonical `examples/<feature>/program.js` used to place
the same executable source in recipes and tutorials. Never edit or publish the
generated mirror as an independent source.

Extension documentation owns only extension behavior. It links to documentation
for the installed ggaction version instead of copying core behavior. Each
implemented feature must connect its specification to the applicable recipe,
API or reference page, executable example, test evidence, and representative
render. When a tutorial applies, it must use the same canonical program at
`examples/<feature>/program.js` as tests and rendered documentation evidence.

Generated repositories provide these documentation commands:

- `npm run docs:profile:check` performs a read-only profile and structure
  integrity check;
- `npm run docs:generate` regenerates canonical example mirrors, metadata,
  search, LLM, reference, and gallery output without changing authored pages or
  the profile lock; and
- `npm run docs:verify` checks profile integrity and generated freshness, builds
  the site in a temporary directory, validates links and assets, exercises
  canonical examples through the public package, and checks responsive,
  keyboard, and baseline accessibility behavior.

`npm run docs:generate -- --check` must compare deterministic generated output
without modifying authored source. The root `npm run verify` command must
include `npm run docs:verify`.

## 4. Initialization Interface

A new extension repository is initialized with:

```sh
npm create ggaction-extension@latest -- \
  --domain=geo \
  --description="Geographic extensions for ggaction"
```

The required inputs are:

- `--domain`: the extension domain name; and
- `--description`: a short package description.

By default, the initializer derives the package name and output directory from
the domain. For example, `geo` produces the package `ggaction-geo` in
`./ggaction-geo`.

The generated package starts at version `0.0.0`, uses the MIT license, and
derives `https://github.com/ggaction/<package-name>` as its repository URL.
An author is omitted unless supplied explicitly. These defaults come from the
template manifest; validation and derivation logic remain ordinary initializer
code rather than a manifest expression language.

`--package`, `--output`, `--author`, `--repository`, `--license`, and
`--ggaction-version` may be provided as optional overrides or metadata.

Providing all required inputs must produce a deterministic, non-interactive
initialization suitable for LLM agents.

## 5. Version 1 Scope

Version 1 supports:

- generating a standalone ESM npm package for one ggaction extension domain;
- specification-driven development with LLM agents;
- registering extension actions at package import time through the public
  `registerExtension` API from `ggaction/extension`;
- allowing multiple compatible extension packages to add non-conflicting
  actions to the `ChartProgram` returned by `chart()` from `ggaction`;
- adding domain actions, pure grammar calculations, and materialization logic;
- producing graphics with existing ggaction graphic primitives and renderers;
- maintaining aligned JavaScript exports, TypeScript declarations, action
  contracts, tests, examples, and documentation; and
- verifying the generated package locally and in continuous integration.

## 6. Version 1 Non-goals

Version 1 does not:

- require ggaction core or public API changes beyond the upstream
  `registerExtension` prerequisite;
- add new backend-neutral graphic primitives or renderers;
- generate multi-package repositories or monorepos;
- automatically publish packages or deploy documentation;
- automatically migrate previously generated repositories; or
- require an LLM, hosted service, account, or network access at package runtime.

## 7. Completion Criteria

Version 1 is complete when the public initialization command can generate a
sample extension repository that:

- contains no unresolved template placeholders;
- includes a valid root `AGENTS.md` and `spec/SPEC.md`;
- validates every indexed data, feature, and decision specification;
- registers its reference action when the package is imported and exposes that
  action on the `ChartProgram` returned by `chart()` from `ggaction`;
- rejects action-name collisions without partially registering an extension;
- includes one complete reference action from specification through rendered
  output;
- passes specification, contract, type, test, example, and package-consumer
  verification;
- produces a valid npm package artifact; and
- can reproduce the same generated source from the same initialization inputs.

The following commands must succeed in the generated repository:

```sh
npm install
npm run spec:validate
npm run verify
npm pack --dry-run
```
