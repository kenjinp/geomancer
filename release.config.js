module.exports = {
  // semantic-release requires at least one non-prerelease ("release") branch
  // that exists on the remote, even if we don't ship from it yet. `release`
  // is a placeholder for the eventual stable v1.0.0 line — it must exist on
  // origin (create it once with `git push origin main:release`) but doesn't
  // need to receive commits until we're ready to cut a stable build.
  //
  // When ready for v1.0.0, merge `main` into `release` and push; CI for
  // `release` (add it to publish.yml's trigger list at that time) will tag
  // and ship the stable build.
  branches: [
    "release",
    {
      name: "main",
      prerelease: "prerelease",
    },
    {
      name: "demo",
      prerelease: true,
    },
    {
      name: "beta",
      prerelease: true,
    },
  ],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "semantic-release-export-data",
  ],
};
