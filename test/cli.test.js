import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const cli = resolve(repositoryRoot, "bin/create-ggaction-extension.js");

async function sandbox(t) {
  const root = await fileSystem.mkdtemp(join(tmpdir(), "ggaction-cli-test-"));
  t.after(() => fileSystem.rm(root, { recursive: true, force: true }));
  return root;
}

function runCli(arguments_, cwd) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, ...arguments_], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolveResult({ code, signal, stdout, stderr });
    });
  });
}

test("creates a repository through the executable CLI", async (t) => {
  const root = await sandbox(t);
  const result = await runCli(
    ["--domain=geo", "--description=Geographic extensions for ggaction"],
    root,
  );
  const output = join(await fileSystem.realpath(root), "ggaction-geo");

  assert.deepEqual(result, {
    code: 0,
    signal: null,
    stdout: `Created ggaction-geo at ${output}\n`,
    stderr: "",
  });
  assert.match(
    await fileSystem.readFile(join(output, "spec/SPEC.md"), "utf8"),
    /package: "ggaction-geo"/,
  );
});

test("prints help without creating output", async (t) => {
  const root = await sandbox(t);
  const result = await runCli(["--help"], root);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /npm create ggaction-extension@latest/);
  assert.match(result.stdout, /--ggaction-version/);
  assert.deepEqual(await fileSystem.readdir(root), []);
});

test("reports invalid input without a stack trace or partial output", async (t) => {
  const root = await sandbox(t);
  const result = await runCli(["--domain=geo"], root);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Error: Missing required option --description\./);
  assert.match(result.stderr, /Run with --help for usage\./);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
  assert.deepEqual(await fileSystem.readdir(root), []);
});

test("preserves an existing non-empty output directory", async (t) => {
  const root = await sandbox(t);
  const output = join(root, "ggaction-geo");
  await fileSystem.mkdir(output);
  await fileSystem.writeFile(join(output, "keep.txt"), "user content");

  const result = await runCli(
    ["--domain=geo", "--description=Geo actions"],
    root,
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /is not empty/);
  assert.equal(
    await fileSystem.readFile(join(output, "keep.txt"), "utf8"),
    "user content",
  );
});

test("publishes only runtime initializer sources", async () => {
  const packageManifest = JSON.parse(
    await fileSystem.readFile(join(repositoryRoot, "package.json"), "utf8"),
  );

  assert.deepEqual(packageManifest.bin, {
    "create-ggaction-extension": "bin/create-ggaction-extension.js",
  });
  assert.deepEqual(packageManifest.files, [
    "bin",
    "profiles",
    "scaffold",
    "src",
    "template.json",
  ]);
});
