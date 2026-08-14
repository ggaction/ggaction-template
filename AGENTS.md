# Repository Instructions

## 1. Mission and Authority

This repository develops and maintains `ggaction-template`, a
specification-driven initializer for creating ggaction extension repositories
that are developed with LLM agents.

`TEMPLATE_SPEC.md` is the canonical product contract for the template. Read it
before changing initialization behavior, generated repository contents, or the
verification workflow. Implement only its current scope.

This root `AGENTS.md` governs development of the template itself. It does not
govern development inside repositories generated from the template.

If an instruction conflicts with `TEMPLATE_SPEC.md` or a requested change would
expand its scope, surface the conflict and resolve it with the user before
implementation.

## 2. Template and Generated Repository Boundary

Keep instructions for maintaining this repository separate from instructions
emitted into generated extension repositories.

Generated instruction files must be stored as scaffold source files such as
`scaffold/AGENTS.md.tmpl`. Do not store them under the active name `AGENTS.md`
inside the scaffold, because repository agents may interpret them as
instructions for developing the template itself.

During initialization, the initializer renders `scaffold/AGENTS.md.tmpl`,
replaces its template variables with extension-specific values, and writes the
result as the root `AGENTS.md` of the generated repository. The `.tmpl` source
file must not appear in the generated repository, and no unresolved template
variables may remain in the generated `AGENTS.md`.

The generated root `AGENTS.md` must be self-contained and govern the
specification-driven development of one extension package. It must not include
template-maintenance rules.

When generated instructions change, update their scaffold source and the
corresponding generation tests or fixtures. Change this root `AGENTS.md` only
when the maintenance rules for `ggaction-template` itself change.

## 3. Canonical Sources

Maintain one canonical owner for each kind of information:

- `TEMPLATE_SPEC.md` owns the template's product behavior, supported scope,
  initialization interface, and completion criteria.
- This root `AGENTS.md` owns the maintenance workflow for this repository.
- Files under `scaffold/` ending in `.tmpl` own the corresponding files emitted
  into generated repositories.
- `profiles/<profile>/profile.json` owns a documentation profile's version,
  upstream provenance, protected inventory, and declared adaptations. Its
  `files/` directory owns the protected repository-local snapshot copied into
  generated documentation.
- `template.json` owns the template version, conventional defaults, scaffold
  root, and selected documentation profile. Keep it a small data file, not a
  declarative validation or derivation language.
- Initializer source owns input validation, value derivation, template-variable
  construction, rendering conventions, output mapping, and filesystem behavior.
- Tests own executable evidence that initialization and generated repositories
  satisfy their contracts.

Generated fixtures and temporary initialized repositories are derived evidence,
not canonical sources. Do not edit them to implement a change. Update the owning
specification, scaffold source, manifest, or initializer and regenerate them.

Do not duplicate exact defaults, mappings, or behavioral contracts across
multiple hand-maintained files. When canonical sources conflict, surface and
resolve the conflict instead of silently choosing one.

## 4. Change Workflow

Before implementation, read the relevant canonical sources and classify the
change:

- A product-contract change modifies initialization behavior, supported scope,
  generated repository contents, or verification guarantees. Update
  `TEMPLATE_SPEC.md` and the implementation in the same coherent change.
- A scaffold-contract change modifies files emitted into generated
  repositories. Update the scaffold source, manifest when applicable, and
  generation tests together.
- A documentation-profile change modifies a protected documentation shell,
  profile provenance, inventory, or allowed adaptation. Confirm the exact
  upstream commit, update the profile manifest and files together, and prove
  that undeclared differences from that commit do not exist.
- An implementation-only change preserves observable initialization and
  generated output behavior. Prove that preservation through existing or added
  tests without rewriting the product contract.

Implement one coherent conceptual change at a time. Preserve unrelated user
work and avoid speculative abstractions or unsupported future profiles.

After implementation, regenerate all derived evidence and verify the result from
a clean temporary output directory. Report what changed, what was verified, and
any unresolved decision.

Treat a change as meaningful when it alters a canonical contract, repository
instruction, scaffold or generated output, initializer behavior, verification
behavior, or another durable user or maintainer workflow. After each verified
meaningful conceptual change, commit only the files belonging to that change
with a terse message and push the current branch before starting the next
meaningful change, unless the user explicitly requests a different checkpoint
strategy. Do not create checkpoint commits for incomplete experiments or
unverified derived output.

## 5. Scaffold and Initializer Rules

The initializer must:

- validate and normalize all initialization inputs before writing files;
- derive conventional values from the domain unless an explicit supported
  override is provided;
- render only `.tmpl` files below the scaffold root declared by
  `template.json`, preserving their relative paths and removing the `.tmpl`
  suffix;
- copy only protected documentation files declared by the selected profile;
- resolve every required template variable and reject unknown or unresolved
  variables;
- remove template-only suffixes such as `.tmpl` from emitted filenames;
- produce the same generated source for the same normalized inputs and template
  version;
- avoid timestamps, random identifiers, machine-specific paths, and network
  state in generated source;
- refuse to overwrite an existing file or non-empty output directory; and
- leave no partial generated repository when validation or rendering fails.

Treat user-provided values as data. Validate their allowed forms and never
interpret them as executable code, shell syntax, or arbitrary template
expressions.

Generated repositories must not contain template-maintenance files,
template-only fixtures, or initializer implementation details.

## 6. Verification

Verify changes at the narrowest relevant level first, then run the complete
generation workflow before declaring the change complete.

Template verification must cover:

- input validation, normalization, and derived values;
- manifest and scaffold mapping validation;
- complete template-variable resolution;
- refusal to overwrite existing content;
- cleanup after failed initialization;
- deterministic output for identical normalized inputs; and
- rejection of template-only files or unresolved placeholders in generated
  repositories.

End-to-end verification must initialize a repository in a fresh temporary
directory and run the generated repository's required checks:

```sh
npm install
npm run spec:validate
npm run verify
npm pack --dry-run
```

Verify public exports and TypeScript declarations through a package-consumer
test rather than source-relative imports. Do not claim a check passed unless it
was actually run, and report any check that could not be completed.

## 7. Decision Gates

Resolve the following decisions with the user before dependent implementation:

- expanding Version 1 scope or removing a stated non-goal;
- changing required CLI inputs, default derivation, output layout, or overwrite
  safety;
- changing the generated repository's root structure, `spec/` contract, or
  agent workflow;
- changing a documentation profile version, pinned source, protected inventory,
  or compatibility contract;
- changing canonical ownership between editable and generated files;
- adding a runtime dependency, hosted service, account requirement, telemetry,
  or network requirement;
- changing ggaction compatibility or requiring a ggaction core, graphic
  primitive, or renderer change;
- weakening deterministic generation, traceability, or required verification;
  or
- adding package publishing or documentation deployment.

For minor and reversible implementation details within the approved contract,
choose the simplest consistent option and record the assumption when it affects
future maintenance.

Do not hide unresolved product or architecture decisions in implementation
details. Keep them explicit until the user resolves them.
