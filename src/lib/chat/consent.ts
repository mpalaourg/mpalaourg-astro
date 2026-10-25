export const CONSENT_COOKIE = 'site_cookie_choice';
export const CONSENT_ACCEPTED = 'chat-v2-accepted';
export const CONSENT_DECLINED = 'chat-v2-declined';
export function readChatConsent(): 'accepted' | 'declined' | null {
  const value = document.cookie.split('; ').find(part => part.startsWith(CONSENT_COOKIE + '='))?.slice(CONSENT_COOKIE.length + 1);
  return value === CONSENT_ACCEPTED ? 'accepted' : value === CONSENT_DECLINED ? 'declined' : null;
}
export const hasChatConsent = () => readChatConsent() === 'accepted';
