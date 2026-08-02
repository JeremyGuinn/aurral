import test from "node:test";
import assert from "node:assert/strict";

import {
  setupIsolatedBackend,
  cleanupIsolatedState,
  resetDatabase,
} from "../helpers/backendTestHarness.js";

const [
  isolatedState,
  { db },
  { dbOps },
  { flowPlaylistConfig },
  { downloadTracker },
  { weeklyFlowWorker },
  { libraryManager },
] = await setupIsolatedBackend(
  "weekly-flow-auto-add",
  "backend/config/db-sqlite.js",
  "backend/db/helpers/index.js",
  "backend/services/weeklyFlow/weeklyFlowPlaylistConfig.js",
  "backend/services/weeklyFlow/weeklyFlowDownloadTracker.js",
  "backend/services/weeklyFlow/weeklyFlowWorker.js",
  "backend/services/libraryManager.js",
);

const originalLibraryManagerMethods = {
  getArtist: libraryManager.getArtist,
  resolveArtistAddOptions: libraryManager.resolveArtistAddOptions,
  addArtistWithResolvedOptions: libraryManager.addArtistWithResolvedOptions,
  addAlbum: libraryManager.addAlbum,
};

test.beforeEach(() => {
  downloadTracker.clearAll();
  resetDatabase(db);
  dbOps.updateSettings({
    integrations: {},
    onboardingComplete: true,
    flows: [],
    sharedPlaylists: [],
    playlistWorker: {
      existingFileMode: "download",
    },
  });
  Object.assign(libraryManager, originalLibraryManagerMethods);
});

test.after(async () => {
  await cleanupIsolatedState(isolatedState);
});

test("processJob auto-adds missing Lidarr artists before download search when enabled", async () => {
  dbOps.updateSettings({
    integrations: {
      lidarr: {
        autoAddMissingArtists: true,
      },
    },
    onboardingComplete: true,
    flows: [],
    sharedPlaylists: [],
    playlistWorker: {
      existingFileMode: "download",
    },
  });
  const playlist = flowPlaylistConfig.createSharedPlaylist({
    name: "Import Queue",
    tracks: [],
  });
  const jobId = downloadTracker.addJob(
    {
      artistName: "Process Artist",
      artistMbid: "44444444-4444-4444-8444-444444444444",
      trackName: "Process Track",
      albumName: "Process Album",
      albumMbid: "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb",
    },
    playlist.id,
  );
  const addCalls = [];
  const addAlbumCalls = [];
  libraryManager.getArtist = async () => null;
  libraryManager.resolveArtistAddOptions = async () => ({
    quality: "standard",
    monitorOption: "none",
    preparedAddOptions: { resolved: { rootFolderPath: "/music", qualityProfileId: 7 } },
    rootFolderPath: "/music",
    qualityProfileId: 7,
    tagId: null,
  });
  libraryManager.addArtistWithResolvedOptions = async (mbid, artistName, options) => {
    addCalls.push({ mbid, artistName, options });
    return { id: 88, mbid, artistName };
  };
  libraryManager.addAlbum = async (artistId, albumMbid, albumName) => {
    addAlbumCalls.push({ artistId, albumMbid, albumName });
    return { id: 321, artistId, mbid: albumMbid, albumName, monitored: true };
  };

  await assert.rejects(
    weeklyFlowWorker.processJob(downloadTracker.getJob(jobId)),
    /No download source is configured/,
  );

  assert.equal(addCalls.length, 1);
  assert.equal(addCalls[0].artistName, "Process Artist");
  assert.equal(addAlbumCalls.length, 1);
  assert.equal(addAlbumCalls[0].artistId, "88");
  assert.equal(addAlbumCalls[0].albumName, "Process Album");
});

test("processJob surfaces auto-add failures during playlist re-search", async () => {
  dbOps.updateSettings({
    integrations: {
      lidarr: {
        autoAddMissingArtists: true,
      },
    },
    onboardingComplete: true,
    flows: [],
    sharedPlaylists: [],
    playlistWorker: {
      existingFileMode: "download",
    },
  });
  const playlist = flowPlaylistConfig.createSharedPlaylist({
    name: "Re-search Queue",
    tracks: [],
  });
  const jobId = downloadTracker.addJob(
    {
      artistName: "Failure Artist",
      artistMbid: "55555555-5555-4555-8555-555555555555",
      trackName: "Failure Track",
    },
    playlist.id,
  );
  libraryManager.getArtist = async () => null;
  libraryManager.resolveArtistAddOptions = async () => ({
    quality: "standard",
    monitorOption: "none",
    preparedAddOptions: { resolved: { rootFolderPath: "/music", qualityProfileId: 7 } },
    rootFolderPath: "/music",
    qualityProfileId: 7,
    tagId: null,
  });
  libraryManager.addArtistWithResolvedOptions = async () => ({
    error: "artist create failed",
  });
  libraryManager.addAlbum = async () => {
    throw new Error("should not attempt album add when artist add fails");
  };

  await assert.rejects(
    weeklyFlowWorker.processJob(downloadTracker.getJob(jobId)),
    /Failed to auto-add Failure Artist to Lidarr: artist create failed/,
  );
});
