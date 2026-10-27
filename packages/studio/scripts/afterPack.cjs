// electron-builder afterPack hook: apply Electron fuses to the packaged
// executable (issue #824). Runs after the app directory is assembled and
// before installers are produced, so both win-unpacked/ and the NSIS
// installer carry the hardened fuse states.
//
// Fuse policy (issue #824):
//   - RunAsNode / NodeCliInspectArguments / NodeOptionsEnvironmentVariable
//     OFF — the packaged app must not be re-targetable as a plain Node
//     runtime (RCE hardening).
//   - EmbeddedAsarIntegrityValidation + OnlyLoadAppFromAsar ON — the
//     renderer/main code may only be loaded from a tamper-checked app.asar.
//     Requires electron>=30 and asar packaging (electron-builder default).

const path = require('node:path');
const {
  flipFuses,
  FuseV1Options,
  FuseVersion,
} = require('@electron/fuses');

const FUSES = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
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
