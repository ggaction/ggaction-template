import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseInitializationOptions } from "../src/options.js";
import {
  RenderError,
  createRenderPlan,
  createTemplateVariables,
  renderTemplate,
} from "../src/render.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const scaffoldRoot = resolve(repositoryRoot, "scaffold");
const manifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "template.json"), "utf8"),
);
const documentationProfile = JSON.parse(
  await readFile(resolve(repositoryRoot, manifest.documentationProfile), "utf8"),
);

async function readTree(root) {
  const entries = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        entries.push({
          path: relative(root, absolutePath).split(sep).join("/"),
          content: await readFile(absolutePath, "utf8"),
        });
      }
    }
  }
  await visit(root);
  return entries;
}

function geoVariables() {
  const options = parseInitializationOptions(
    ["--domain=geo", "--description=Geographic extensions for ggaction"],
    manifest,
  );
  return createTemplateVariables(options, documentationProfile);
}

test("creates the complete canonical variable map", () => {
  assert.deepEqual(geoVariables(), {
    packageName: "ggaction-geo",
    domain: "geo",
    domainPascalCase: "Geo",
    referenceActionName: "createGeoReference",
    referenceOptionsName: "CreateGeoReferenceOptions",
    referenceGraphicId: "geo-reference",
    description: "Geographic extensions for ggaction",
    descriptionYaml: '"Geographic extensions for ggaction"',
    authorJsonProperty: "",
    packageVersion: "0.0.0",
    repositoryUrl: "https://github.com/ggaction/ggaction-geo",
    license: "MIT",
    ggactionVersion: "^0.0.10",
    typescriptVersion: "7.0.2",
    docsProfile: "ggaction-docs-v1",
    docsProfileVersion: "1.0.0",
  });
});

test("renders initializer variables without interpreting replacement text", () => {
  const rendered = renderTemplate(
    "Package {{packageName}} costs {{price}}.",
    { packageName: "ggaction-geo", price: "$&5" },
    "README.md.tmpl",
  );
  assert.equal(rendered, "Package ggaction-geo costs $&5.");
});

test("preserves Jekyll Liquid expressions", () => {
  const rendered = renderTemplate(
    "# {{ site.title }}\n{{ content | escape }}\n{{packageName}}\n",
    { packageName: "ggaction-geo" },
  );
  assert.equal(
    rendered,
    "# {{ site.title }}\n{{ content | escape }}\nggaction-geo\n",
  );
});

test("rejects unknown initializer variables with source context", () => {
  assert.throws(
    () => renderTemplate("{{missingValue}}", {}, "spec/SPEC.md.tmpl"),
    /Unknown template variable \{\{missingValue\}\} in spec\/SPEC\.md\.tmpl/,
  );
});

test("maps templates and profile files to sorted output paths", () => {
  const plan = createRenderPlan({
    templates: [
      { path: "spec/SPEC.md.tmpl", content: "# {{packageName}}" },
      { path: "AGENTS.md.tmpl", content: "Domain: {{domain}}" },
    ],
    profileFiles: [
      { path: "_layouts/default.html", content: "{{ content }}" },
    ],
    generatedFiles: [
      { path: "docs/profile-lock.json", content: "{}\n" },
    ],
    variables: geoVariables(),
  });

  assert.deepEqual(plan, [
    { path: "AGENTS.md", content: "Domain: geo" },
    { path: "docs/_layouts/default.html", content: "{{ content }}" },
    { path: "docs/profile-lock.json", content: "{}\n" },
    { path: "spec/SPEC.md", content: "# ggaction-geo" },
  ]);
});

test("rejects duplicate output paths before writing", () => {
  assert.throws(
    () =>
      createRenderPlan({
        templates: [
          { path: "docs/_layouts/default.html.tmpl", content: "template" },
        ],
        profileFiles: [
          { path: "_layouts/default.html", content: "profile" },
        ],
        variables: {},
      }),
    /produced by both/,
  );
});

test("rejects unsafe paths and non-template scaffold files", () => {
  for (const path of ["../outside.tmpl", "/absolute.tmpl", "a/../b.tmpl", "a\\b.tmpl"]) {
    assert.throws(
      () => createRenderPlan({ templates: [{ path, content: "" }], variables: {} }),
      RenderError,
      path,
    );
  }
  assert.throws(
    () =>
      createRenderPlan({
        templates: [{ path: "README.md", content: "" }],
        variables: {},
      }),
    /must end in \.tmpl/,
  );
});

test("renders every current scaffold file without losing Jekyll expressions", async () => {
  const templates = await readTree(scaffoldRoot);
  const plan = createRenderPlan({ templates, variables: geoVariables() });

  assert.equal(plan.length, templates.length);
  assert.ok(plan.every((entry) => !entry.path.endsWith(".tmpl")));

  const agents = plan.find((entry) => entry.path === "AGENTS.md");
  assert.match(agents.content, /ggaction-geo/);
  assert.doesNotMatch(agents.content, /\{\{packageName\}\}/);

  const docsIndex = plan.find((entry) => entry.path === "docs/index.md");
  assert.match(docsIndex.content, /\{\{ site\.title \}\}/);
  assert.doesNotMatch(docsIndex.content, /\{\{packageName\}\}/);
});
