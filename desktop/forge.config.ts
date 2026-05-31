import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { PublisherGithub } from "@electron-forge/publisher-github";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

import type { ForgeConfig } from "@electron-forge/shared-types";

// Only attempt to sign/notarize on macOS CI where the App Store Connect API
// key has been written to disk. This keeps local `package`/`make` runs on a
// dev machine (which lack the credentials) from failing in the sign step.
const shouldNotarize =
  process.platform === "darwin" && !!process.env.APPLE_API_KEY;

// Linux executables/`.desktop` Exec entries are conventionally lowercase, and
// the deb/rpm makers derive their `bin` from the lowercased name. Keep the
// nicer capitalized name on macOS/Windows.
const isLinux = process.platform === "linux";
const executableName = isLinux ? "geomancer" : "Geomancer";

const config: ForgeConfig = {
  publishers: [
    new PublisherGithub({
      repository: {
        owner: "kenjinp",
        name: "geomancer",
      },
      // prerelease: true,
    }),
  ],
  packagerConfig: {
    asar: true,
    icon: "public/icons/icon",
    executableName,
    // `@electron/osx-sign` defaults to the "Developer ID Application" identity
    // in the keychain and applies hardened runtime + Electron's default
    // entitlements (allow-jit / allow-unsigned-executable-memory), required
    // both for notarization and for the asar integrity fuse below.
    osxSign: {},
    // Notarization only runs on macOS CI where the App Store Connect API key
    // has been written to disk, so local `package`/`make` runs without
    // credentials don't fail in the notarize step.
    ...(shouldNotarize
      ? {
          osxNotarize: {
            appleApiKey: process.env.APPLE_API_KEY!,
            appleApiKeyId: process.env.APPLE_API_KEY_ID!,
            appleApiIssuer: process.env.APPLE_API_ISSUER_ID!,
          },
        }
      : {}),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: "Geomancer",
    }),
    new MakerZIP({}),
    new MakerRpm({
      options: {
        name: "Geomancer",
        // Must match `packagerConfig.executableName` so the maker can find the
        // packaged binary (out/geomancer-linux-x64/geomancer).
        bin: executableName,
        homepage: "https://kenny.wtf",
        // WebGPU runtime: Vulkan loader + Mesa ICDs.
        // NVIDIA users get their ICD from the proprietary driver package.
        requires: ["vulkan-loader", "mesa-vulkan-drivers"],
      },
    }),
    new MakerDeb({
      options: {
        name: "Geomancer",
        // Must match `packagerConfig.executableName` so the maker can find the
        // packaged binary (out/geomancer-linux-x64/geomancer).
        bin: executableName,
        maintainer: "Kenneth Pirman",
        homepage: "https://kenny.wtf",
        // WebGPU runtime: Vulkan loader + Mesa ICDs.
        // NVIDIA users get their ICD from the proprietary driver package.
        depends: ["libvulkan1", "mesa-vulkan-drivers"],
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main/main.ts",
          config: "vite.main.config.mts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.mts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
