import type { PdfCaptureDependencies } from '@hraness/wordcell/pdf';
import type { PdfAuthOutput } from './pdf-auth.js';
/** Public embedding boundary. Ghostget retains sign-in, network and download ownership;
 * callers may supply Wordcell's typed native runner for process supervision. */
export async function runPdfAcquisition(
  args:readonly string[],
  environment:Readonly<Record<string,string|undefined>>,
  output:PdfAuthOutput,
  captureDependencies?:PdfCaptureDependencies,
):Promise<number>{
  const {runSignedInPdfCommand}=await import('./pdf-auth.js');
  const {runPdfCommand}=await import('@hraness/wordcell/pdf');
  return runSignedInPdfCommand(args,output,{
    environment,stdinIsTTY:false,stderrIsTTY:false,
    runWordcellPdf:(arguments_,download)=>runPdfCommand(arguments_,environment,output,{
      ...(captureDependencies?{captureDependencies}:{}),
      ...(download?{preparePdfSource:async()=>({inputPath:download.inputPath,remoteSource:{requestedUrl:download.requestedUrl,finalUrl:download.finalUrl},dispose:()=>undefined})}:{}),
    }),
  });
}
export type {PdfCaptureDependencies};
export type {PdfAuthOutput} from './pdf-auth.js';
