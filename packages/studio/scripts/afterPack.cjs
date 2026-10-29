/**
 * electron-builder afterPack hook: flip Electron fuses on the packed binary.
 *
 * Fuse bisection for issue #824 (two earlier attempts broke packaged E2E —
 * see development log): this iteration flips ONLY the Node CLI surface bits,
 * enableNodeCliInspectArguments and enableNodeOptionsEnvironmentVariable,
 * and pins runAsNode to its default ON state because the packaged Playwright
 * E2E smoke launches the app via ELECTRON_RUN_AS_NODE. CookieEncryption /
 * OnlyLoadAppFromAsar / EmbeddedAsarIntegrityValidation (the previously
 * broken suspects) stay at their shipped defaults and are bisected in later
 * iterations.
 *
 * NOTE (@electron/fuses 2.x API, per project KB): flipFuses rewrites ONLY
 * the enumerated bits, so the wire is deterministic only for what is listed;
 * FuseVersion.V1 is the correct enum spelling.
 */

const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

module.exports = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName: platform } = context;
  const productFilename = packager.appInfo.productFilename;

  let binaryPath;
  if (platform === 'darwin' || platform === 'mas') {
    binaryPath = path.join(
      appOutDir,
      `${productFilename}.app`,
      'Contents',
      'MacOS',
      productFilename,
    );
  } else {
    const extension = platform === 'win32' ? '.exe' : '';
    binaryPath = path.join(appOutDir, `${productFilename}${extension}`);
  }

  await flipFuses(binaryPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: true, // pinned ON: packaged E2E needs it
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  });
  console.log(`afterPack: fuses flipped for ${binaryPath}`);
};
