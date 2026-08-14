import { parseArgs } from "node:util";

const OPTION_DEFINITIONS = Object.freeze({
  domain: { type: "string" },
  description: { type: "string" },
  package: { type: "string" },
  output: { type: "string" },
  author: { type: "string" },
  repository: { type: "string" },
  license: { type: "string" },
  "ggaction-version": { type: "string" },
});

const DOMAIN_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PACKAGE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const LICENSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9().+\- ]*$/;
const GGACTION_VERSION_PATTERN = /^[~^]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export class CliInputError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "CliInputError";
  }
}

function normalizedRequired(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CliInputError(`Missing required option --${name}.`);
  }
  if (value.includes("\0")) {
    throw new CliInputError(`Option --${name} contains an invalid null byte.`);
  }
  return value.trim();
}

function normalizedOptional(value, name) {
  if (value === undefined) return undefined;
  if (value.trim() === "") {
    throw new CliInputError(`Option --${name} must not be empty.`);
  }
  if (value.includes("\0")) {
    throw new CliInputError(`Option --${name} contains an invalid null byte.`);
  }
  return value.trim();
}

function assertPattern(value, pattern, message) {
  if (!pattern.test(value)) throw new CliInputError(message);
  return value;
}

function normalizeDomain(value) {
  const domain = normalizedRequired(value, "domain").toLowerCase();
  return assertPattern(
    domain,
    DOMAIN_PATTERN,
    "Option --domain must be a lowercase kebab-case name after normalization.",
  );
}

function normalizePackage(value) {
  const packageName = value.toLowerCase();
  if (packageName.length > 214) {
    throw new CliInputError("Option --package must not exceed 214 characters.");
  }
  return assertPattern(
    packageName,
    PACKAGE_PATTERN,
    "Option --package must be a valid unscoped npm package name.",
  );
}

function normalizeRepository(value) {
  let repository;
  try {
    repository = new URL(value);
  } catch {
    throw new CliInputError("Option --repository must be an absolute HTTPS URL.");
  }
  if (repository.protocol !== "https:") {
    throw new CliInputError("Option --repository must be an absolute HTTPS URL.");
  }
  return repository.href.replace(/\/$/, "");
}

function normalizeManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new CliInputError("The template manifest is missing or invalid.");
  }

  const defaults = manifest.defaults;
  const requiredDefaults = [
    "packagePrefix",
    "githubOwner",
    "ggactionVersion",
    "license",
    "packageVersion",
  ];
  for (const name of requiredDefaults) {
    if (typeof defaults?.[name] !== "string" || defaults[name].trim() === "") {
      throw new CliInputError(`The template manifest default ${name} is missing.`);
    }
  }
  return defaults;
}

export function parseCliArguments(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: OPTION_DEFINITIONS,
      strict: true,
      allowPositionals: false,
      tokens: true,
    });
  } catch (error) {
    throw new CliInputError(error.message, { cause: error });
  }

  const seen = new Set();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) {
      throw new CliInputError(`Option --${token.name} may be provided only once.`);
    }
    seen.add(token.name);
  }

  return parsed.values;
}

export function resolveInitializationOptions(values, manifest) {
  const defaults = normalizeManifest(manifest);
  const domain = normalizeDomain(values.domain);
  const description = normalizedRequired(values.description, "description");

  const packageOverride = normalizedOptional(values.package, "package");
  const packageName = normalizePackage(
    packageOverride ?? `${defaults.packagePrefix}${domain}`,
  );

  const outputDirectory = normalizedOptional(values.output, "output") ?? `./${packageName}`;
  const author = normalizedOptional(values.author, "author");
  const repositoryOverride = normalizedOptional(values.repository, "repository");
  const repositoryUrl = normalizeRepository(
    repositoryOverride ?? `https://github.com/${defaults.githubOwner}/${packageName}`,
  );

  const license = normalizedOptional(values.license, "license") ?? defaults.license;
  assertPattern(
    license,
    LICENSE_PATTERN,
    "Option --license must be an SPDX license identifier or expression.",
  );

  const ggactionVersion =
    normalizedOptional(values["ggaction-version"], "ggaction-version") ??
    defaults.ggactionVersion;
  assertPattern(
    ggactionVersion,
    GGACTION_VERSION_PATTERN,
    "Option --ggaction-version must be an exact, caret, or tilde semantic version.",
  );

  return Object.freeze({
    domain,
    description,
    packageName,
    outputDirectory,
    author,
    repositoryUrl,
    license,
    packageVersion: defaults.packageVersion,
    ggactionVersion,
  });
}

export function parseInitializationOptions(argv, manifest) {
  return resolveInitializationOptions(parseCliArguments(argv), manifest);
}
