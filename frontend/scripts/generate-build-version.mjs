import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

function buildTimestamp(date) {
  const compact = date.toISOString().replace(/[-:T.Z]/g, "");

  return `${compact.slice(0, 8)}-${compact.slice(8, 17)}`;
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "nogit";
  }
}

const version = `${buildTimestamp(new Date())}-${gitCommit()}`;
writeFileSync(resolve(process.cwd(), ".build-version"), `${version}\n`, "utf8");
process.stdout.write(`Frontend build version: ${version}\n`);
