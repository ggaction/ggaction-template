import assert from "node:assert/strict";
import * as fileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WriteError, writeRenderPlan } from "../src/write.js";

async function sandbox(t) {
  const root = await fileSystem.mkdtemp(join(tmpdir(), "ggaction-writer-test-"));
  t.after(() => fileSystem.rm(root, { recursive: true, force: true }));
  return root;
}

const plan = Object.freeze([
  Object.freeze({ path: "AGENTS.md", content: "# Generated instructions\n" }),
  Object.freeze({ path: "spec/SPEC.md", content: "# Generated spec\n" }),
  Object.freeze({ path: "assets/data.bin", content: new Uint8Array([0, 1, 2]) }),
]);

test("writes and verifies a complete repository", async (t) => {
  const root = await sandbox(t);
  const target = join(root, "ggaction-geo");

  const result = await writeRenderPlan(plan, target);

  assert.deepEqual(result, { outputDirectory: target, fileCount: 3 });
  assert.equal(
    await fileSystem.readFile(join(target, "AGENTS.md"), "utf8"),
    "# Generated instructions\n",
  );
  assert.deepEqual(
    await fileSystem.readFile(join(target, "assets/data.bin")),
    Buffer.from([0, 1, 2]),
  );
  assert.deepEqual(await fileSystem.readdir(root), ["ggaction-geo"]);
});

test("accepts an existing empty output directory", async (t) => {
  const root = await sandbox(t);
  const target = join(root, "ggaction-geo");
  await fileSystem.mkdir(target);

  await writeRenderPlan(plan, target);

  assert.equal(
    await fileSystem.readFile(join(target, "spec/SPEC.md"), "utf8"),
    "# Generated spec\n",
  );
});

test("refuses to overwrite a non-empty directory", async (t) => {
  const root = await sandbox(t);
  const target = join(root, "ggaction-geo");
  await fileSystem.mkdir(target);
  await fileSystem.writeFile(join(target, "keep.txt"), "user content");

  await assert.rejects(() => writeRenderPlan(plan, target), /is not empty/);

  assert.equal(
    await fileSystem.readFile(join(target, "keep.txt"), "utf8"),
    "user content",
  );
  assert.deepEqual(await fileSystem.readdir(root), ["ggaction-geo"]);
});

test("refuses to overwrite an existing file", async (t) => {
  const root = await sandbox(t);
  const target = join(root, "ggaction-geo");
  await fileSystem.writeFile(target, "user content");

  await assert.rejects(() => writeRenderPlan(plan, target), /not a directory/);
  assert.equal(await fileSystem.readFile(target, "utf8"), "user content");
});

test("removes staging output after a write failure", async (t) => {
  const root = await sandbox(t);
  const target = join(root, "nested", "ggaction-geo");
  let writes = 0;
  const failingFileSystem = {
    ...fileSystem,
    async writeFile(...arguments_) {
      writes += 1;
      if (writes === 2) {
        const error = new Error("simulated write failure");
        error.code = "EIO";
        throw error;
      }
      return fileSystem.writeFile(...arguments_);
    },
  };

  await assert.rejects(
    () => writeRenderPlan(plan, target, { fileSystem: failingFileSystem }),
    WriteError,
  );

  assert.deepEqual(await fileSystem.readdir(root), []);
});

test("removes staging output after content verification fails", async (t) => {
  const root = await sandbox(t);
  const target = join(root, "ggaction-geo");
  const corruptingFileSystem = {
    ...fileSystem,
    async writeFile(path, content, options) {
      const written = path.endsWith("AGENTS.md") ? "corrupt" : content;
      return fileSystem.writeFile(path, written, options);
    },
  };

  await assert.rejects(
    () => writeRenderPlan(plan, target, { fileSystem: corruptingFileSystem }),
    /failed content verification/,
  );

  assert.deepEqual(await fileSystem.readdir(root), []);
});

test("restores a pre-existing empty directory when the final move fails", async (t) => {
  const root = await sandbox(t);
  const target = join(root, "ggaction-geo");
  await fileSystem.mkdir(target);
  const failingFileSystem = {
    ...fileSystem,
    async rename() {
      const error = new Error("simulated rename failure");
      error.code = "EACCES";
      throw error;
    },
  };

  await assert.rejects(
    () => writeRenderPlan(plan, target, { fileSystem: failingFileSystem }),
    WriteError,
  );

  assert.deepEqual(await fileSystem.readdir(target), []);
  assert.deepEqual(await fileSystem.readdir(root), ["ggaction-geo"]);
});

test("rejects unsafe and conflicting plans before creating output", async (t) => {
  const root = await sandbox(t);
  const target = join(root, "ggaction-geo");

  await assert.rejects(
    () => writeRenderPlan([{ path: "../outside", content: "bad" }], target),
    /safe relative POSIX paths/,
  );
  await assert.rejects(
    () =>
      writeRenderPlan(
        [
          { path: "docs", content: "file" },
          { path: "docs/index.md", content: "nested file" },
        ],
        target,
      ),
    /both a file and a directory/,
  );
  await assert.rejects(
    () => writeRenderPlan([], target),
    /at least one file/,
  );

  assert.deepEqual(await fileSystem.readdir(root), []);
});

test("refuses to use the working directory itself as output", async (t) => {
  const root = await sandbox(t);
  await assert.rejects(
    () => writeRenderPlan(plan, ".", { cwd: root }),
    /must not be the working directory/,
  );
  assert.deepEqual(await fileSystem.readdir(root), []);
});
