import { createHash } from "node:crypto";
import * as defaultFileSystem from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseInitializationOptions } from "./options.js";
import { createRenderPlan, createTemplateVariables } from "./render.js";
import { writeRenderPlan } from "./write.js";

const defaultTemplateRoot = fileURLToPath(new URL("..", import.meta.url));

export class InitializationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "InitializationError";
  }
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function safeManifestPath(value, label) {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.includes("\0") ||
    value.includes("\\") ||
    posix.isAbsolute(value) ||
    posix.normalize(value) !== value ||
    value === "." ||
    value === ".." ||
    value.startsWith("../")
  ) {
    throw new InitializationError(`${label} must be a safe relative POSIX path.`);
  }
  return value;
}

function fromManifestPath(root, filePath) {
  return join(root, ...filePath.split("/"));
}

async function readJson(fileSystem, filePath, label) {
  let source;
  try {
    source = await fileSystem.readFile(filePath, "utf8");
  } catch (error) {
    throw new InitializationError(`Could not read ${label} at ${filePath}.`, {
      cause: error,
    });
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new InitializationError(`${label} at ${filePath} is not valid JSON.`, {
      cause: error,
    });
  }
}

async function requireRegularFile(fileSystem, filePath, label) {
  let stats;
  try {
    stats = await fileSystem.lstat(filePath);
  } catch (error) {
    throw new InitializationError(`${label} is missing at ${filePath}.`, {
      cause: error,
    });
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new InitializationError(`${label} must be a regular file at ${filePath}.`);
  }
}

async function readTree(fileSystem, root, label, encoding) {
  let rootStats;
  try {
    rootStats = await fileSystem.lstat(root);
  } catch (error) {
    throw new InitializationError(`${label} is missing at ${root}.`, {
      cause: error,
    });
  }
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new InitializationError(`${label} must be a regular directory at ${root}.`);
  }

  const files = [];
  async function visit(directory) {
    const entries = await fileSystem.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new InitializationError(`${label} must not contain symlinks: ${absolutePath}.`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new InitializationError(
          `${label} contains an unsupported entry: ${absolutePath}.`,
        );
      }
      files.push({
        path: relative(root, absolutePath).split(sep).join("/"),
        content: await fileSystem.readFile(absolutePath, encoding),
      });
    }
  }
  await visit(root);
  return files;
}

function validateTemplateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new InitializationError("The template manifest must be an object.");
  }
  if (!Number.isInteger(manifest.version) || manifest.version < 1) {
    throw new InitializationError("The template manifest version must be a positive integer.");
  }
  safeManifestPath(manifest.scaffold, "The scaffold path");
  safeManifestPath(
    manifest.documentationProfile,
    "The documentation profile path",
  );
}

function validateDocumentationProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new InitializationError("The documentation profile must be an object.");
  }
  for (const field of ["profile", "version"]) {
    if (typeof profile[field] !== "string" || profile[field] === "") {
      throw new InitializationError(`The documentation profile field ${field} is required.`);
    }
  }
  if (!profile.source || typeof profile.source !== "object") {
    throw new InitializationError("The documentation profile source is required.");
  }
  for (const field of ["repository", "commit", "directory", "license", "licenseFile"]) {
    if (typeof profile.source[field] !== "string" || profile.source[field] === "") {
      throw new InitializationError(
        `The documentation profile source field ${field} is required.`,
      );
    }
  }
  if (!/^[0-9a-f]{40}$/.test(profile.source.commit)) {
    throw new InitializationError(
      "The documentation profile source commit must be a full lowercase Git commit.",
    );
  }
  safeManifestPath(profile.source.directory, "The profile source directory");
  safeManifestPath(profile.source.licenseFile, "The profile license path");

  for (const field of ["protectedRoots", "files"]) {
    if (!Array.isArray(profile[field]) || profile[field].length === 0) {
      throw new InitializationError(`The documentation profile ${field} must be non-empty.`);
    }
    const unique = new Set();
    for (const filePath of profile[field]) {
      safeManifestPath(filePath, `The documentation profile ${field} entry`);
      if (unique.has(filePath)) {
        throw new InitializationError(
          `The documentation profile ${field} contains duplicate ${filePath}.`,
        );
      }
      unique.add(filePath);
    }
  }

  for (const protectedRoot of profile.protectedRoots) {
    if (
      !profile.files.some(
        (filePath) =>
          filePath === protectedRoot || filePath.startsWith(`${protectedRoot}/`),
      )
    ) {
      throw new InitializationError(
        `The protected root ${protectedRoot} does not own any declared profile file.`,
      );
    }
  }

  if (!Array.isArray(profile.adaptations)) {
    throw new InitializationError("The documentation profile adaptations must be an array.");
  }
  const adaptedPaths = new Set();
  for (const adaptation of profile.adaptations) {
    if (!adaptation || typeof adaptation !== "object") {
      throw new InitializationError("Each documentation profile adaptation must be an object.");
    }
    const adaptedPath = safeManifestPath(
      adaptation.path,
      "The documentation profile adaptation path",
    );
    if (!profile.files.includes(adaptedPath)) {
      throw new InitializationError(
        `The adaptation path ${adaptedPath} is not a declared profile file.`,
      );
    }
    if (adaptedPaths.has(adaptedPath)) {
      throw new InitializationError(
        `The documentation profile adaptations contain duplicate ${adaptedPath}.`,
      );
    }
    if (typeof adaptation.reason !== "string" || adaptation.reason.trim() === "") {
      throw new InitializationError(
        `The documentation profile adaptation ${adaptedPath} needs a reason.`,
      );
    }
    adaptedPaths.add(adaptedPath);
  }
}

function compareInventory(actual, declared, label) {
  const actualPaths = actual.map((entry) => entry.path).sort(compareText);
  const declaredPaths = [...declared].sort(compareText);
  if (
    actualPaths.length !== declaredPaths.length ||
    actualPaths.some((filePath, index) => filePath !== declaredPaths[index])
  ) {
    const actualSet = new Set(actualPaths);
    const declaredSet = new Set(declaredPaths);
    const missing = declaredPaths.filter((filePath) => !actualSet.has(filePath));
    const unexpected = actualPaths.filter((filePath) => !declaredSet.has(filePath));
    throw new InitializationError(
      `${label} does not match its manifest (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}).`,
    );
  }
}

function createProfileLock(profile, profileFiles) {
  const files = profileFiles
    .map((entry) => ({
      path: entry.path,
      sha256: createHash("sha256").update(entry.content).digest("hex"),
    }))
    .sort((left, right) => compareText(left.path, right.path));

  return `${JSON.stringify(
    {
      profile: profile.profile,
      version: profile.version,
      source: profile.source,
      protectedRoots: profile.protectedRoots,
      files,
    },
    null,
    2,
  )}\n`;
}

export async function loadInitializationSources(
  templateRoot = defaultTemplateRoot,
  { fileSystem = defaultFileSystem } = {},
) {
  const root = resolve(templateRoot);
  const manifestPath = join(root, "template.json");
  const manifest = await readJson(
    fileSystem,
    manifestPath,
    "the template manifest",
  );
  validateTemplateManifest(manifest);

  const scaffoldRoot = fromManifestPath(root, manifest.scaffold);
  const templates = await readTree(
    fileSystem,
    scaffoldRoot,
    "The scaffold",
    "utf8",
  );
  const invalidTemplate = templates.find((entry) => !entry.path.endsWith(".tmpl"));
  if (invalidTemplate) {
    throw new InitializationError(
      `The scaffold contains non-template file ${invalidTemplate.path}.`,
    );
  }

  const profileManifestPath = fromManifestPath(
    root,
    manifest.documentationProfile,
  );
  await requireRegularFile(
    fileSystem,
    profileManifestPath,
    "The documentation profile manifest",
  );
  const documentationProfile = await readJson(
    fileSystem,
    profileManifestPath,
    "the documentation profile manifest",
  );
  validateDocumentationProfile(documentationProfile);

  const profileRoot = dirname(profileManifestPath);
  await requireRegularFile(
    fileSystem,
    fromManifestPath(profileRoot, documentationProfile.source.licenseFile),
    "The documentation profile license",
  );
  const profileFiles = await readTree(
    fileSystem,
    join(profileRoot, "files"),
    "The documentation profile files",
  );
  compareInventory(
    profileFiles,
    documentationProfile.files,
    "The documentation profile file inventory",
  );

  return Object.freeze({
    manifest,
    documentationProfile,
    templates: Object.freeze(templates),
    profileFiles: Object.freeze(profileFiles),
    profileLock: createProfileLock(documentationProfile, profileFiles),
  });
}

export async function initializeRepository(
  argv,
  {
    cwd = process.cwd(),
    templateRoot = defaultTemplateRoot,
    fileSystem = defaultFileSystem,
  } = {},
) {
  const sources = await loadInitializationSources(templateRoot, { fileSystem });
  const options = parseInitializationOptions(argv, sources.manifest);
  const variables = createTemplateVariables(
    options,
    sources.documentationProfile,
  );
  const plan = createRenderPlan({
    templates: sources.templates,
    profileFiles: sources.profileFiles,
    generatedFiles: [
      { path: "docs/profile-lock.json", content: sources.profileLock },
    ],
    variables,
  });
  const written = await writeRenderPlan(plan, options.outputDirectory, {
    cwd,
    fileSystem,
  });

  return Object.freeze({
    ...written,
    packageName: options.packageName,
    domain: options.domain,
  });
}
