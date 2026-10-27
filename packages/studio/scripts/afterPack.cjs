// electron-builder afterPack hook: apply Electron fuses to the packaged
// executable (issue #824). Runs after the app directory is assembled and
// before installers are produced, so both win-unpacked/ and the NSIS
// installer carry the hardened fuse states.
//
// Fuse policy (issue #824, E2E-compatible subset — see notes):
//   - NodeOptionsEnvironmentVariable / NodeCliInspectArguments OFF —
//     the packaged app must not be re-targetable via env/CLI injection.
//   - EnableCookieEncryption ON — cookies at rest are OS-encrypted.
//   - OnlyLoadAppFromAsar ON — application code may only load from the
//     packaged app.asar (electron-builder asar default).
//
// Deliberately NOT flipped (CI Windows packaged E2E gates these):
//   - RunAsNode: playwright's `_electron.launch` starts the app through
//     ELECTRON_RUN_AS_NODE, so disabling the fuse breaks the packaged E2E
//     smoke suite entirely (known Playwright/Electron-fuses incompatibility).
//     Revisit when the smoke suite can launch the binary directly.
//   - EmbeddedAsarIntegrityValidation: on Windows the asar integrity header
//     is embedded during code signing; our CI builds are unsigned, so
//     enabling it makes the app fail to start. Enable together with real
//     release signing (see #833).

const path = require('node:path');
const {
  flipFuses,
  FuseV1Options,
  FuseVersion,
} = require('@electron/fuses');

const FUSES = {
  version: FuseVersion.V1,
  // Defaults kept deliberately (flipFuses only rewrites listed bits, so
  // every fuse is pinned explicitly to make the target wire unambiguous):
  [FuseV1Options.RunAsNode]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
  // Hardened:
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const productName = packager.appInfo.productName;

  let executableName = productName;
  if (electronPlatformName === 'darwin') {
    executableName = path.join(
      `${productName}.app`,
      'Contents',
      'MacOS',
      productName,
    );
  } else if (electronPlatformName === 'win32') {
    executableName = `${productName}.exe`;
  } else if (electronPlatformName === 'linux') {
    executableName = packager.appInfo.sanitizedProductName;
  }

  const executablePath = path.join(appOutDir, executableName);
  await flipFuses(executablePath, FUSES);
  console.log(
    `[afterPack] Electron fuses applied to ${path.basename(executablePath)}`,
  );
};
