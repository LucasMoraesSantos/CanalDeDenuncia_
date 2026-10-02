import { cp, mkdir, rm } from "node:fs/promises";

const outputDirectory = new URL("../dist/", import.meta.url);
const staticFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "admin.html",
  "admin.css",
  "admin.js",
  "_redirects",
];

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  staticFiles.map((file) =>
    cp(new URL(`../${file}`, import.meta.url), new URL(file, outputDirectory)),
  ),
);

console.log(`Site gerado em ${outputDirectory.pathname}`);
