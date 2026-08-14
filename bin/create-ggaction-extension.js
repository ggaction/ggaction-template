#!/usr/bin/env node

import { initializeRepository } from "../src/initialize.js";

const help = `Create a specification-driven ggaction extension repository.

Usage:
  npm create ggaction-extension@latest -- \\
    --domain=<domain> \\
    --description="<description>"

Required options:
  --domain              Extension domain, such as geo or hierarchy
  --description         Short package description

Optional overrides:
  --package             npm package name
  --output              Output directory
  --author              Package author
  --repository          HTTPS repository URL
  --license             SPDX license identifier or expression
  --ggaction-version    Exact, caret, or tilde ggaction version
  --help, -h            Show this help
`;

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write(help);
} else {
  try {
    const result = await initializeRepository(argv);
    process.stdout.write(
      `Created ${result.packageName} at ${result.outputDirectory}\n`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown initialization failure.";
    process.stderr.write(`Error: ${message}\nRun with --help for usage.\n`);
    process.exitCode = 1;
  }
}
