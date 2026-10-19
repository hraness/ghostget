import {createHash} from 'node:crypto';
import type {AuthSnapshot} from '../auth';
import {isValidBrowserSpec} from './args';
/** Exact saved browser selector only. Cookie material never crosses this boundary. */
export function ephemeralAccountSelection(snapshot: AuthSnapshot, accountId: string): {browser: string; authContext: string} {
  if (!snapshot || snapshot.auth.id !== accountId || !/^[a-f0-9]{64}$/u.test(snapshot.contentSha256)) throw new Error('integrity');
  const auth = snapshot.auth;
  if (auth.kind === 'browser-profile' && (auth.cookieProfile === undefined || auth.storageState !== undefined || auth.browserExecutable !== undefined)) throw new Error('unsupported');
  const source = auth.kind === 'cookie-source' ? auth.source : auth.kind === 'browser-profile' ? auth.cookieSource : undefined;
  const profile = auth.kind === 'cookie-source' ? auth.profile : auth.kind === 'browser-profile' ? auth.cookieProfile : undefined;
  // yt-dlp cannot represent Ghostget storageState, OAuth, raw cookie files or an
  // unannotated dedicated Chromium profile through --cookies-from-browser.
  if (source === undefined || !['brave','chrome','chromium','edge','firefox','opera','safari','vivaldi','whale'].includes(source)) throw new Error('unsupported');
  // ':' is yt-dlp's container/profile grammar; never reinterpret a literal profile.
  if (profile !== undefined && (!profile || profile.includes(':'))) throw new Error('unsupported');
  const browser = profile === undefined ? source : `${source}:${profile}`;
  if (!isValidBrowserSpec(browser)) throw new Error('unsupported');
  const authContext = createHash('sha256').update(JSON.stringify(['ghostget-media-account-v1',accountId,snapshot.contentSha256])).digest('hex');
  return {browser,authContext};
}
