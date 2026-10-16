// @bun
import {
  __require
} from "./index-z1w83f81.js";

// src/pdf-acquisition.ts
async function runPdfAcquisition(args, environment, output, captureDependencies) {
  const { runSignedInPdfCommand } = await import("./pdf-auth-qhmqhw85.js");
  const { runPdfCommand } = await import("@hraness/wordcell/pdf");
  return runSignedInPdfCommand(args, output, {
    environment,
    stdinIsTTY: false,
    stderrIsTTY: false,
    runWordcellPdf: (arguments_, download) => runPdfCommand(arguments_, environment, output, {
      ...captureDependencies ? { captureDependencies } : {},
      ...download ? { preparePdfSource: async () => ({ inputPath: download.inputPath, remoteSource: { requestedUrl: download.requestedUrl, finalUrl: download.finalUrl }, dispose: () => {
        return;
      } }) } : {}
    })
  });
}
export {
  runPdfAcquisition
};
