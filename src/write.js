import { Buffer } from "node:buffer";
import * as defaultFileSystem from "node:fs/promises";
import { basename, dirname, join, posix, resolve } from "node:path";

export class WriteError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "WriteError";
  }
}

function isMissing(error) {
  return error?.code === "ENOENT";
}

function normalizePlan(plan) {
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new WriteError("The render plan must contain at least one file.");
  }

  const normalized = [];
  const paths = new Set();
  for (const entry of plan) {
    if (!entry || typeof entry !== "object") {
      throw new WriteError("Each render plan entry must be an object.");
    }

    const filePath = entry.path;
    if (
      typeof filePath !== "string" ||
      filePath === "" ||
      filePath.includes("\0") ||
      filePath.includes("\\") ||
      posix.isAbsolute(filePath) ||
      posix.normalize(filePath) !== filePath ||
      filePath === "." ||
      filePath === ".." ||
      filePath.startsWith("../")
    ) {
      throw new WriteError("Render plan paths must be safe relative POSIX paths.");
    }
    if (paths.has(filePath)) {
      throw new WriteError(`Render plan contains duplicate path ${filePath}.`);
    }

    const sourceContent = entry.content;
    if (
      typeof sourceContent !== "string" &&
      !(sourceContent instanceof Uint8Array)
    ) {
      throw new WriteError(`Render plan file ${filePath} must contain text or bytes.`);
    }

    paths.add(filePath);
    normalized.push({
      path: filePath,
      content:
        typeof sourceContent === "string"
          ? sourceContent
          : new Uint8Array(sourceContent),
    });
  }

  for (const filePath of paths) {
    const parts = filePath.split("/");
    for (let length = 1; length < parts.length; length += 1) {
      const parentPath = parts.slice(0, length).join("/");
      if (paths.has(parentPath)) {
        throw new WriteError(
          `Render plan path ${parentPath} cannot be both a file and a directory.`,
        );
      }
    }
  }
  return normalized;
}

async function inspectTarget(fileSystem, target) {
  let stats;
  try {
    stats = await fileSystem.lstat(target);
  } catch (error) {
    if (isMissing(error)) return { exists: false, emptyDirectory: false };
    throw error;
  }

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new WriteError(`Output path ${target} already exists and is not a directory.`);
  }
  const entries = await fileSystem.readdir(target);
  if (entries.length > 0) {
    throw new WriteError(`Output directory ${target} is not empty.`);
  }
  return { exists: true, emptyDirectory: true };
}

async function verifyStaging(fileSystem, staging, plan) {
  for (const entry of plan) {
    const destination = join(staging, ...entry.path.split("/"));
    const actual = await fileSystem.readFile(destination);
    const expected = Buffer.from(entry.content);
    if (!actual.equals(expected)) {
      throw new WriteError(`Generated file ${entry.path} failed content verification.`);
    }
  }
}

async function removeCreatedParents(fileSystem, parent, firstCreated) {
  if (!firstCreated) return;
  const boundary = dirname(firstCreated);
  let current = parent;
  while (current !== boundary) {
    try {
      await fileSystem.rmdir(current);
    } catch (error) {
      if (isMissing(error)) {
        // Continue upward when a child was already removed.
      } else if (error?.code === "ENOTEMPTY" || error?.code === "EEXIST") {
        return;
      } else {
        throw error;
      }
    }
    current = dirname(current);
  }
}

async function restoreEmptyTarget(fileSystem, target) {
  try {
    await fileSystem.lstat(target);
  } catch (error) {
    if (!isMissing(error)) throw error;
    await fileSystem.mkdir(target);
  }
}

export async function writeRenderPlan(
  plan,
  outputDirectory,
  { cwd = process.cwd(), fileSystem = defaultFileSystem } = {},
) {
  const normalizedPlan = normalizePlan(plan);
  if (
    typeof outputDirectory !== "string" ||
    outputDirectory.trim() === "" ||
    outputDirectory.includes("\0")
  ) {
    throw new WriteError("An output directory is required.");
  }

  const workingDirectory = resolve(cwd);
  const target = resolve(workingDirectory, outputDirectory);
  if (target === workingDirectory || dirname(target) === target) {
    throw new WriteError(
      "The output must not be the working directory or a filesystem root.",
    );
  }

  const parent = dirname(target);
  const targetState = await inspectTarget(fileSystem, target);
  let firstCreatedParent;
  let staging;
  let removedEmptyTarget = false;

  try {
    firstCreatedParent = await fileSystem.mkdir(parent, { recursive: true });
    staging = await fileSystem.mkdtemp(join(parent, `.${basename(target)}.tmp-`));

    for (const entry of normalizedPlan) {
      const destination = join(staging, ...entry.path.split("/"));
      await fileSystem.mkdir(dirname(destination), { recursive: true });
      await fileSystem.writeFile(destination, entry.content, { flag: "wx" });
    }

    await verifyStaging(fileSystem, staging, normalizedPlan);

    if (targetState.emptyDirectory) {
      await fileSystem.rmdir(target);
      removedEmptyTarget = true;
    }
    await fileSystem.rename(staging, target);
    staging = undefined;
    removedEmptyTarget = false;

    return Object.freeze({
      outputDirectory: target,
      fileCount: normalizedPlan.length,
    });
  } catch (error) {
    if (staging) {
      await fileSystem.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
    if (removedEmptyTarget) {
      await restoreEmptyTarget(fileSystem, target).catch(() => {});
    }
    await removeCreatedParents(fileSystem, parent, firstCreatedParent).catch(() => {});

    if (error instanceof WriteError) throw error;
    throw new WriteError(`Could not create repository at ${target}.`, {
      cause: error,
    });
  }
}
