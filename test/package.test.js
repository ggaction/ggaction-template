import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

test("the packed initializer produces a fully verified extension repository", {
  timeout: 120_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ggaction-package-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const packed = await execFileAsync(
    "npm",
    ["pack", "--json", "--pack-destination", root],
    { cwd: repositoryRoot },
  );
  const [metadata] = JSON.parse(packed.stdout);
  const archive = join(root, metadata.filename);
  const packedPaths = metadata.files.map((entry) => entry.path);

  assert.ok(packedPaths.includes("bin/create-ggaction-extension.js"));
  assert.ok(packedPaths.includes("scaffold/AGENTS.md.tmpl"));
  assert.ok(packedPaths.includes("profiles/ggaction-docs-v1/profile.json"));
  assert.ok(!packedPaths.includes("AGENTS.md"));
  assert.ok(!packedPaths.includes("TEMPLATE_SPEC.md"));
  assert.ok(packedPaths.every((filePath) => !filePath.startsWith("test/")));

  const consumer = join(root, "consumer");
  await mkdir(consumer);
  await execFileAsync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive],
    { cwd: consumer },
  );
  const executable = join(
    consumer,
    "node_modules",
    ".bin",
    process.platform === "win32"
      ? "create-ggaction-extension.cmd"
      : "create-ggaction-extension",
  );
  const initialized = await execFileAsync(
    executable,
    ["--domain=geo", "--description=Geo actions"],
    { cwd: consumer },
  );

  assert.match(initialized.stdout, /^Created ggaction-geo at /);
  assert.match(
    await readFile(join(consumer, "ggaction-geo", "spec", "SPEC.md"), "utf8"),
    /package: "ggaction-geo"/,
  );

  const extension = join(consumer, "ggaction-geo");
  await execFileAsync(
    "npm",
    ["install", "--no-audit", "--no-fund"],
    { cwd: extension, maxBuffer: 10 * 1024 * 1024 },
  );
  const specification = await execFileAsync(
    "npm",
    ["run", "spec:validate"],
    { cwd: extension, maxBuffer: 10 * 1024 * 1024 },
  );
  assert.match(specification.stdout, /generated evidence are current/);

  const verification = await execFileAsync(
    "npm",
    ["run", "verify"],
    { cwd: extension, maxBuffer: 10 * 1024 * 1024 },
  );
  assert.match(
    verification.stdout,
    /Documentation verified across 12 built pages/,
  );
  assert.match(
    verification.stdout,
    /Packed consumer verified ggaction-geo@0\.0\.0/,
  );

  const dryRun = await execFileAsync(
    "npm",
    ["pack", "--dry-run", "--json"],
    { cwd: extension, maxBuffer: 10 * 1024 * 1024 },
  );
  const [extensionMetadata] = JSON.parse(dryRun.stdout);
  assert.deepEqual(
    extensionMetadata.files.map((entry) => entry.path).sort(),
    [
      "LICENSE",
      "README.md",
      "package.json",
      "src/actions/reference.js",
      "src/index.js",
      "types/index.d.ts",
    ],
  );
});
