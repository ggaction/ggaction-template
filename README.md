# create-ggaction-extension

Create a specification-driven repository for a ggaction extension developed
with LLM agents.

The generated repository starts with a runnable reference action and keeps its
living specification, implementation, types, tests, examples, rendered
evidence, and ggaction-compatible documentation connected by automated checks.

## Create an extension

Node.js 20 or newer is required.

```sh
npm create ggaction-extension@latest -- \
  --domain=geo \
  --description="Geographic extensions for ggaction"
```

The domain determines the conventional package name and output directory. The
example creates `ggaction-geo/`. Use `--help` to see the supported metadata and
path overrides.

## Work in the generated repository

Start by following the generated `AGENTS.md`. It guides the agent through a
one-question-at-a-time specification interview before domain implementation.

```sh
cd ggaction-geo
npm install
npm run spec:validate
npm run verify
npm pack --dry-run
```

`npm run verify` checks specification indexes and traceability, the pinned
documentation profile and static site, runtime behavior, TypeScript
augmentation, executable examples, rendered SVG evidence, and consumption of
the actual packed extension.

Importing a completed extension registers its actions on ggaction's complete
program:

```js
import { chart } from "ggaction";
import "ggaction-geo";

const program = chart();
```

## Template development

`TEMPLATE_SPEC.md` is the product contract for this initializer. The root
`AGENTS.md` governs template maintenance; `scaffold/AGENTS.md.tmpl` becomes the
different `AGENTS.md` used inside generated extension repositories.

Run the complete release qualification with:

```sh
npm ci
npm run verify
npm publish --dry-run
```

The publish lifecycle reruns `npm run verify`. Publishing itself is a separate,
explicit release action.

## License

MIT
