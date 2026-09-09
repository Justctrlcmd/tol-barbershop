import assert from "node:assert/strict";
import test from "node:test";

import {
  canAutoReload,
  isNewDeployment,
  parseBuildVersion,
} from "./deployment-version.ts";

test("same build version does not require a reload", () => {
  assert.equal(isNewDeployment("build-a", "build-a"), false);
});

test("new build version requires a reload", () => {
  assert.equal(isNewDeployment("build-a", "build-b"), true);
});

test("malformed or unavailable version data is ignored", () => {
  assert.equal(parseBuildVersion(null), null);
  assert.equal(parseBuildVersion({}), null);
  assert.equal(parseBuildVersion({ version: "" }), null);
  assert.equal(parseBuildVersion({ version: "<script>" }), null);
  assert.equal(isNewDeployment("build-a", null), false);
});

test("valid version data is normalized", () => {
  assert.equal(
    parseBuildVersion({ version: " 20260909-173000-a82f12c " }),
    "20260909-173000-a82f12c",
  );
});

test("protected input and prior reload attempts postpone automatic reload", () => {
  assert.equal(canAutoReload(true, null, "build-b"), false);
  assert.equal(canAutoReload(false, "build-b", "build-b"), false);
  assert.equal(canAutoReload(false, "build-a", "build-b"), true);
});
