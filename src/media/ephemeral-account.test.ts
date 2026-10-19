import {expect,test} from 'bun:test';
import type {AuthSnapshot} from '../auth';
import {ephemeralAccountSelection} from './ephemeral-account';
const snapshot:AuthSnapshot={auth:{schemaVersion:1,id:'personal',kind:'cookie-source',source:'chrome',profile:'Profile 1'},contentSha256:'a'.repeat(64)};
test('saved browser selection binds the exact account snapshot without exposing locator bytes in identity',()=>{
 const selected=ephemeralAccountSelection(snapshot,'personal');expect(selected.browser).toBe('chrome:Profile 1');expect(selected.authContext).toMatch(/^[a-f0-9]{64}$/u);
 expect(ephemeralAccountSelection({...snapshot,contentSha256:'b'.repeat(64)},'personal').authContext).not.toBe(selected.authContext);
 expect(()=>ephemeralAccountSelection(snapshot,'other')).toThrow('integrity');
});
test('annotated browser-profile uses its explicit cookie source; unsupported kinds never fall back',()=>{
 const browser:AuthSnapshot={...snapshot,auth:{schemaVersion:1,id:'personal',kind:'browser-profile',profile:'/private/managed',trustUnfilteredEgress:true,cookieSource:'firefox',cookieProfile:'work'}};
 expect(ephemeralAccountSelection(browser,'personal').browser).toBe('firefox:work');
 for(const auth of [{schemaVersion:1,id:'personal',kind:'cookies-file',path:'/private/cookies'},{schemaVersion:1,id:'personal',kind:'browser-profile',profile:'/private/managed',trustUnfilteredEgress:true},{...snapshot.auth,profile:'profile::container'},{...browser.auth,cookieProfile:undefined},{...browser.auth,storageState:'/private/storage.json'},{...browser.auth,browserExecutable:'/private/browser'}])expect(()=>ephemeralAccountSelection({...snapshot,auth} as AuthSnapshot,'personal')).toThrow('unsupported');
});
