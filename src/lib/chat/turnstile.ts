// Cloudflare publishes these dummy credentials for local integration testing.
// They are not production secrets and must never authorize a public hostname.
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
export const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';
const testSites = new Set([TURNSTILE_TEST_SITE_KEY,'2x00000000000000000000AB','1x00000000000000000000BB','2x00000000000000000000BB','3x00000000000000000000FF']);
const passSites = new Set([TURNSTILE_TEST_SITE_KEY,'1x00000000000000000000BB','3x00000000000000000000FF']);
const testSecrets = new Set([TURNSTILE_TEST_SECRET_KEY,'2x0000000000000000000000000000000AA','3x0000000000000000000000000000000AA']);
export const localChatHost = (hostname:string) => ['localhost','127.0.0.1','[::1]'].includes(hostname);
export type TurnstileVerification = {success?:boolean;hostname?:string;action?:string;metadata?:{result_with_testing_key?:boolean}};
export function validTurnstile(result:TurnstileVerification,hostname:string,siteKey:string,secretKey:string) {
  if(result.success!==true)return false;
  const markedTest=result.metadata?.result_with_testing_key===true;
  if(markedTest||testSites.has(siteKey)||testSecrets.has(secretKey)) {
    return localChatHost(hostname)&&markedTest&&passSites.has(siteKey)&&secretKey===TURNSTILE_TEST_SECRET_KEY;
  }
  return result.hostname===hostname&&result.action==='site-chat';
}
