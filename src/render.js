import { posix } from "node:path";

const TEMPLATE_SUFFIX = ".tmpl";
const INITIALIZER_PLACEHOLDER = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

export class RenderError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RenderError";
  }
}

function requireString(value, name) {
  if (typeof value !== "string") {
    throw new RenderError(`${name} must be a string.`);
  }
  return value;
}

function validateRelativePath(filePath, label) {
  requireString(filePath, label);
  if (
    filePath === "" ||
    filePath.includes("\0") ||
    filePath.includes("\\") ||
    posix.isAbsolute(filePath)
  ) {
    throw new RenderError(`${label} must be a safe relative POSIX path.`);
  }

  const normalized = posix.normalize(filePath);
  if (
    normalized !== filePath ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new RenderError(`${label} must be a safe relative POSIX path.`);
  }
  return filePath;
}

function validateVariables(variables) {
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new RenderError("Template variables must be an object.");
  }

  const normalized = Object.create(null);
  for (const [name, value] of Object.entries(variables)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      throw new RenderError(`Invalid template variable name ${name}.`);
    }
    normalized[name] = requireString(value, `Template variable ${name}`);
  }
  return normalized;
}

function comparePaths(left, right) {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

export function createTemplateVariables(options, documentationProfile) {
  if (!options || typeof options !== "object") {
    throw new RenderError("Normalized initialization options are required.");
  }
  if (!documentationProfile || typeof documentationProfile !== "object") {
    throw new RenderError("A documentation profile is required.");
  }

  const values = {
    packageName: options.packageName,
    domain: options.domain,
    descriptionYaml: JSON.stringify(options.description),
    packageVersion: options.packageVersion,
    repositoryUrl: options.repositoryUrl,
    license: options.license,
    ggactionVersion: options.ggactionVersion,
    docsProfile: documentationProfile.profile,
    docsProfileVersion: documentationProfile.version,
  };

  for (const [name, value] of Object.entries(values)) {
    requireString(value, `Template variable ${name}`);
  }
  return Object.freeze(values);
}

export function renderTemplate(content, variables, sourcePath = "<template>") {
  requireString(content, "Template content");
  const normalizedVariables = validateVariables(variables);

  return content.replace(INITIALIZER_PLACEHOLDER, (placeholder, name) => {
    if (!Object.hasOwn(normalizedVariables, name)) {
      throw new RenderError(
        `Unknown template variable ${placeholder} in ${sourcePath}.`,
      );
    }
    return normalizedVariables[name];
  });
}

export function createRenderPlan({
  templates,
  profileFiles = [],
  variables,
}) {
  if (!Array.isArray(templates)) {
    throw new RenderError("Templates must be an array.");
  }
  if (!Array.isArray(profileFiles)) {
    throw new RenderError("Documentation profile files must be an array.");
  }

  const destinations = new Map();
  const plan = [];

  function add(destination, content, source) {
    if (destinations.has(destination)) {
      throw new RenderError(
        `Output path ${destination} is produced by both ${destinations.get(destination)} and ${source}.`,
      );
    }
    destinations.set(destination, source);
    plan.push(Object.freeze({ path: destination, content }));
  }

  for (const template of templates) {
    if (!template || typeof template !== "object") {
      throw new RenderError("Each template entry must be an object.");
    }
    const sourcePath = validateRelativePath(template.path, "Template path");
    if (!sourcePath.endsWith(TEMPLATE_SUFFIX)) {
      throw new RenderError(`Template path ${sourcePath} must end in .tmpl.`);
    }
    const destination = sourcePath.slice(0, -TEMPLATE_SUFFIX.length);
    validateRelativePath(destination, "Rendered output path");
    add(
      destination,
      renderTemplate(template.content, variables, sourcePath),
      `template ${sourcePath}`,
    );
  }

  for (const profileFile of profileFiles) {
    if (!profileFile || typeof profileFile !== "object") {
      throw new RenderError("Each documentation profile entry must be an object.");
    }
    const sourcePath = validateRelativePath(
      profileFile.path,
      "Documentation profile path",
    );
    const destination = `docs/${sourcePath}`;
    const sourceContent = profileFile.content;
    if (
      typeof sourceContent !== "string" &&
      !(sourceContent instanceof Uint8Array)
    ) {
      throw new RenderError(
        `Documentation profile file ${sourcePath} must contain text or bytes.`,
      );
    }
    const content =
      typeof sourceContent === "string"
        ? sourceContent
        : new Uint8Array(sourceContent);
    add(destination, content, `documentation profile ${sourcePath}`);
  }

  plan.sort(comparePaths);
  return Object.freeze(plan);
}
