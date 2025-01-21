import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { PublisherGithub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

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
    icon: "icons/icon",
    // this does not seem to be used in the make step
    // despite whatever the docs say
    // executableName: "Geomancer",
    // osxNotarize: {
    //   tool: 'notarytool',
    //   appleApiKey: process.env.APPLE_API_KEY,
    //   appleApiKeyId: process.env.APPLE_API_KEY_ID,
    //   appleApiIssuer: process.env.APPLE_API_ISSUER_ID,
    // },
    // osxSign: {},
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
        homepage: "https://kenny.wtf",
      },
    }),
    new MakerDeb({
      options: {
        name: "Geomancer",
        maintainer: "Kenneth Pirman",
        homepage: "https://kenny.wtf",
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
