/**
 * electron-builder afterPack hook: flip Electron fuses on the packed binary.
 *
 * Fuse bisection for issue #824. Findings so far (CI-packaged-E2E-verified):
 * - RunAsNode must stay ON: Playwright's loader launches the binary via
 *   ELECTRON_RUN_AS_NODE (previous attempt v1).
 * - EnableNodeCliInspectArguments must stay ON: Playwright's _electron.launch
 *   always spawns the app with "--inspect=0" (playwright-core coreBundle) and
 *   talks over the inspector; flipping the fuse off makes the E2E smoke time
 *   out (bisection iteration 1). Can only be flipped if the E2E launcher is
 *   reworked off the Node-inspector transport.
 * - EnableNodeOptionsEnvironmentVariable is SAFE to flip OFF: Playwright
 *   deletes NODE_OPTIONS from the spawn env itself (coreBundle: "delete env.
 *   NODE_OPTIONS"), so nothing in the E2E path relies on the fuse. Verified
 *   green in bisection iteration 2.
 *
 * - EnableEmbeddedAsarIntegrityValidation ON is SAFE: electron-builder 24+
 *   embeds asar integrity data on Windows by default (26.8.1 here), and in
 *   ELECTRON_RUN_AS_NODE mode no app loads, so the check is inert. Verified
 *   green in bisection iteration 3 (it had never been tested alone before —
 *   attempt v1 only combined it with RunAsNode OFF).
 *
 * - OnlyLoadAppFromAsar ON is SAFE: packaged builds already load from the
 *   asar archive (electron-builder default) and the ELECTRON_RUN_AS_NODE
 *   E2E path loads no app at all. Verified green in bisection iteration 4.
 *
 * This iteration (5) adds CookieEncryption: ON — the last fuse from the
 * issue's hardening set that was never tested in isolation. It one-shots
 * ON (irreversible), encrypting Chromium cookie storage with OS-level
 * credentials (DPAPI on Windows); the smoke test does not depend on
 * persisted cookies. In attempt v2 it was only combined with the
 * proven-fatal EnableNodeCliInspectArguments OFF. RunAsNode /
 * NodeCliInspect stay pinned ON for the Playwright E2E gate; that
 * trade-off is documented for #824 (revisit when the gate moves off the
 * Node-inspector transport).
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
    [FuseV1Options.RunAsNode]: true, // pinned ON: Playwright loader needs it
    [FuseV1Options.EnableNodeCliInspectArguments]: true, // pinned ON: Playwright spawns --inspect=0
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // iter 2: green
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // iter 3: green
    [FuseV1Options.OnlyLoadAppFromAsar]: true, // iter 4: green
    [FuseV1Options.EnableCookieEncryption]: true, // iter 5: under test (one-shot)
  });
  console.log(`afterPack: fuses flipped for ${binaryPath}`);
};
