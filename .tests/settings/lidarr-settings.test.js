import test from "node:test";
import assert from "node:assert/strict";

import {
  setupIsolatedBackend,
  cleanupIsolatedState,
  resetDatabase,
} from "../helpers/backendTestHarness.js";

const [isolatedState, { db }, { dbOps }] = await setupIsolatedBackend(
  "lidarr-settings",
  "backend/config/db-sqlite.js",
  "backend/db/helpers/index.js",
);

test.beforeEach(() => {
  resetDatabase(db);
});

test.after(async () => {
  await cleanupIsolatedState(isolatedState);
});

test("Lidarr auto-add-missing-artists defaults to disabled when unset", () => {
  dbOps.updateSettings({
    integrations: {
      lidarr: {
        url: "http://lidarr.local",
      },
    },
  });

  assert.equal(dbOps.getSettings().integrations.lidarr.autoAddMissingArtists, false);
});

test("Lidarr auto-add-missing-artists persists when enabled", () => {
  dbOps.updateSettings({
    integrations: {
      lidarr: {
        url: "http://lidarr.local",
        autoAddMissingArtists: true,
      },
    },
  });

  assert.equal(dbOps.getSettings().integrations.lidarr.autoAddMissingArtists, true);
});
