import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CliInputError,
  parseCliArguments,
  parseInitializationOptions,
  resolveInitializationOptions,
} from "../src/options.js";

const manifest = JSON.parse(
  await readFile(new URL("../template.json", import.meta.url), "utf8"),
);

test("derives conventional values from the required inputs", () => {
  const options = parseInitializationOptions(
    ["--domain=geo", "--description=Geographic extensions for ggaction"],
    manifest,
  );

  assert.deepEqual(options, {
    domain: "geo",
    description: "Geographic extensions for ggaction",
    packageName: "ggaction-geo",
    outputDirectory: "./ggaction-geo",
    author: undefined,
    repositoryUrl: "https://github.com/ggaction/ggaction-geo",
    license: "MIT",
    packageVersion: "0.0.0",
    ggactionVersion: "^0.0.10",
  });
});

test("normalizes surrounding whitespace and domain casing", () => {
  const options = parseInitializationOptions(
    ["--domain", " Geo-JSON ", "--description", " GeoJSON actions "],
    manifest,
  );

  assert.equal(options.domain, "geo-json");
  assert.equal(options.description, "GeoJSON actions");
  assert.equal(options.packageName, "ggaction-geo-json");
});

test("applies every supported override", () => {
  const options = parseInitializationOptions(
    [
      "--domain=geo",
      "--description=Geo actions",
      "--package=custom-geo",
      "--output=./packages/custom-geo",
      "--author=Example Author",
      "--repository=https://example.com/custom-geo/",
      "--license=Apache-2.0",
      "--ggaction-version=~0.0.10",
    ],
    manifest,
  );

  assert.deepEqual(options, {
    domain: "geo",
    description: "Geo actions",
    packageName: "custom-geo",
    outputDirectory: "./packages/custom-geo",
    author: "Example Author",
    repositoryUrl: "https://example.com/custom-geo",
    license: "Apache-2.0",
    packageVersion: "0.0.0",
    ggactionVersion: "~0.0.10",
  });
});

test("requires domain and description", () => {
  assert.throws(
    () => resolveInitializationOptions({ description: "Geo actions" }, manifest),
    /--domain/,
  );
  assert.throws(
    () => resolveInitializationOptions({ domain: "geo" }, manifest),
    /--description/,
  );
});

test("rejects invalid domains", () => {
  for (const domain of ["geo_json", "geo--json", "1geo", "geo/json", "한글"]) {
    assert.throws(
      () =>
        resolveInitializationOptions(
          { domain, description: "Geo actions" },
          manifest,
        ),
      CliInputError,
      domain,
    );
  }
});

test("rejects unsafe or unsupported overrides", () => {
  const base = { domain: "geo", description: "Geo actions" };

  assert.throws(
    () => resolveInitializationOptions({ ...base, package: "@scope/geo" }, manifest),
    /unscoped npm package/,
  );
  assert.throws(
    () => resolveInitializationOptions({ ...base, output: "bad\0path" }, manifest),
    /null byte/,
  );
  assert.throws(
    () => resolveInitializationOptions({ ...base, description: "bad\0description" }, manifest),
    /null byte/,
  );
  assert.throws(
    () => resolveInitializationOptions({ ...base, repository: "git@example.com:x" }, manifest),
    /HTTPS URL/,
  );
  assert.throws(
    () => resolveInitializationOptions({ ...base, license: "MIT; echo bad" }, manifest),
    /SPDX/,
  );
  assert.throws(
    () => resolveInitializationOptions({ ...base, "ggaction-version": "latest" }, manifest),
    /semantic version/,
  );
});

test("rejects unknown, positional, and duplicate CLI arguments", () => {
  assert.throws(() => parseCliArguments(["--unknown=value"]), CliInputError);
  assert.throws(() => parseCliArguments(["geo"]), CliInputError);
  assert.throws(
    () => parseCliArguments(["--domain=geo", "--domain=hierarchy"]),
    /only once/,
  );
});

test("requires every canonical manifest default", () => {
  for (const name of Object.keys(manifest.defaults)) {
    const invalidManifest = structuredClone(manifest);
    delete invalidManifest.defaults[name];
    assert.throws(
      () =>
        resolveInitializationOptions(
          { domain: "geo", description: "Geo actions" },
          invalidManifest,
        ),
      new RegExp(name),
      name,
    );
  }
});
