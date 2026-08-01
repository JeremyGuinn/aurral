import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSettings } from "../../frontend/src/pages/Settings/utils.js";

test("normalizeSettings defaults Lidarr auto-add-missing-artists to false", () => {
  const normalized = normalizeSettings({
    integrations: {
      lidarr: {},
    },
  });

  assert.equal(normalized.integrations.lidarr.autoAddMissingArtists, false);
});

test("normalizeSettings preserves Lidarr auto-add-missing-artists when enabled", () => {
  const normalized = normalizeSettings({
    integrations: {
      lidarr: {
        autoAddMissingArtists: true,
      },
    },
  });

  assert.equal(normalized.integrations.lidarr.autoAddMissingArtists, true);
});
