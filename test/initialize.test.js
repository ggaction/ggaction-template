import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  InitializationError,
  initializeRepository,
  loadInitializationSources,
} from "../src/initialize.js";

const templateRoot = fileURLToPath(new URL("..", import.meta.url));

async function sandbox(t) {
  const root = await fileSystem.mkdtemp(join(tmpdir(), "ggaction-initialize-test-"));
  t.after(() => fileSystem.rm(root, { recursive: true, force: true }));
  return root;
}

async function copyTemplateFixture(destination) {
  await fileSystem.mkdir(destination);
  await fileSystem.copyFile(
    join(templateRoot, "template.json"),
    join(destination, "template.json"),
  );
  await fileSystem.cp(
    join(templateRoot, "scaffold"),
    join(destination, "scaffold"),
    { recursive: true },
  );
  await fileSystem.cp(
    join(templateRoot, "profiles"),
    join(destination, "profiles"),
    { recursive: true },
  );
}

async function readTree(root) {
  const files = [];
  async function visit(directory) {
    const entries = await fileSystem.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else {
        files.push({
          path: relative(root, absolutePath).split(sep).join("/"),
          content: await fileSystem.readFile(absolutePath),
        });
      }
    }
  }
  await visit(root);
  return files;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("initializes a repository from the canonical template", async (t) => {
  const root = await sandbox(t);
  const result = await initializeRepository(
    ["--domain=geo", "--description=Geographic extensions for ggaction"],
    { cwd: root },
  );
  const output = join(root, "ggaction-geo");

  assert.deepEqual(result, {
    outputDirectory: output,
    fileCount: 85,
    packageName: "ggaction-geo",
    domain: "geo",
  });
  assert.match(
    await fileSystem.readFile(join(output, "AGENTS.md"), "utf8"),
    /`ggaction-geo`/,
  );
  assert.match(
    await fileSystem.readFile(join(output, "spec/SPEC.md"), "utf8"),
    /ggactionVersion: "\^0\.0\.10"/,
  );

  const files = await readTree(output);
  assert.equal(files.length, 85);
  assert.ok(files.every((entry) => !entry.path.endsWith(".tmpl")));
  for (const entry of files) {
    if (entry.path === "docs/profile-lock.json") continue;
    const text = entry.content.toString("utf8");
    assert.doesNotMatch(text, /\{\{[A-Za-z][A-Za-z0-9]*\}\}/);
  }
});

test("renders optional package authors as JSON data", async (t) => {
  const root = await sandbox(t);
  await initializeRepository(
    [
      "--domain=geo",
      "--description=Geo actions",
      '--author=Example "Maintainer"',
    ],
    { cwd: root },
  );

  const packageJson = JSON.parse(
    await fileSystem.readFile(
      join(root, "ggaction-geo", "package.json"),
      "utf8",
    ),
  );
  assert.equal(packageJson.author, 'Example "Maintainer"');
});

test("writes a lock matching every copied documentation profile file", async (t) => {
  const root = await sandbox(t);
  await initializeRepository(
    ["--domain=geo", "--description=Geo actions"],
    { cwd: root },
  );
  const docs = join(root, "ggaction-geo", "docs");
  const lock = JSON.parse(
    await fileSystem.readFile(join(docs, "profile-lock.json"), "utf8"),
  );

  assert.equal(lock.profile, "ggaction-docs-v1");
  assert.equal(lock.version, "1.0.0");
  assert.match(lock.source.commit, /^[0-9a-f]{40}$/);
  assert.equal(lock.files.length, 27);
  assert.deepEqual(
    lock.files.map((entry) => entry.path),
    [...lock.files.map((entry) => entry.path)].sort(),
  );
  for (const entry of lock.files) {
    assert.equal(
      sha256(await fileSystem.readFile(join(docs, ...entry.path.split("/")))),
      entry.sha256,
      entry.path,
    );
  }
});

test("produces identical source for identical inputs", async (t) => {
  const root = await sandbox(t);
  const common = ["--domain=geo", "--description=Geo actions"];
  await initializeRepository([...common, "--output=./first"], { cwd: root });
  await initializeRepository([...common, "--output=./second"], { cwd: root });

  const first = await readTree(join(root, "first"));
  const second = await readTree(join(root, "second"));
  assert.deepEqual(first, second);
});

test("loads only a scaffold made entirely of templates", async (t) => {
  const root = await sandbox(t);
  const fixture = join(root, "template");
  await copyTemplateFixture(fixture);
  await fileSystem.writeFile(join(fixture, "scaffold", "unexpected.txt"), "bad");

  await assert.rejects(
    () => loadInitializationSources(fixture),
    /non-template file unexpected\.txt/,
  );
});

test("rejects undeclared and missing documentation profile files", async (t) => {
  const root = await sandbox(t);
  const fixture = join(root, "template");
  await copyTemplateFixture(fixture);
  await fileSystem.writeFile(
    join(fixture, "profiles", "ggaction-docs-v1", "files", "unexpected.txt"),
    "bad",
  );

  await assert.rejects(
    () => loadInitializationSources(fixture),
    /unexpected: unexpected\.txt/,
  );

  await fileSystem.unlink(
    join(fixture, "profiles", "ggaction-docs-v1", "files", "unexpected.txt"),
  );
  await fileSystem.unlink(
    join(
      fixture,
      "profiles",
      "ggaction-docs-v1",
      "files",
      "_layouts",
      "default.html",
    ),
  );
  await assert.rejects(
    () => loadInitializationSources(fixture),
    /missing: _layouts\/default\.html/,
  );
});

test("does not create output when source validation fails", async (t) => {
  const root = await sandbox(t);
  const fixture = join(root, "template");
  const outputRoot = join(root, "output");
  await copyTemplateFixture(fixture);
  const profileManifestPath = join(
    fixture,
    "profiles",
    "ggaction-docs-v1",
    "profile.json",
  );
  const profile = JSON.parse(await fileSystem.readFile(profileManifestPath, "utf8"));
  profile.source.commit = "mutable-branch";
  await fileSystem.writeFile(profileManifestPath, `${JSON.stringify(profile, null, 2)}\n`);

  await assert.rejects(
    () =>
      initializeRepository(
        ["--domain=geo", "--description=Geo actions"],
        { cwd: outputRoot, templateRoot: fixture },
      ),
    InitializationError,
  );
  await assert.rejects(() => fileSystem.lstat(outputRoot), { code: "ENOENT" });
});

test("rejects unsafe canonical source mappings", async (t) => {
  const root = await sandbox(t);
  const fixture = join(root, "template");
  await copyTemplateFixture(fixture);
  const manifestPath = join(fixture, "template.json");
  const manifest = JSON.parse(await fileSystem.readFile(manifestPath, "utf8"));
  manifest.scaffold = "../outside";
  await fileSystem.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(
    () => loadInitializationSources(fixture),
    /scaffold path must be a safe relative POSIX path/,
  );
});
