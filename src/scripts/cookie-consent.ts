import { readChatConsent } from '../lib/chat/consent';
const notice = document.getElementById('cookie-popup');
const reopen = document.getElementById('cookie-notice-reopen');
if (notice && reopen) {
  const el = notice.dataset.lang === 'el';
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('site-cookie-choice') : null;
  channel?.addEventListener('message', () => {
    window.dispatchEvent(new CustomEvent('site-cookie-choice', { detail: readChatConsent() }));
    notice.hidden = true; reopen.hidden = false;
  });
  notice.hidden = readChatConsent() !== null; reopen.hidden = !notice.hidden;
  const show = () => { notice.hidden = false; reopen.hidden = true; notice.querySelector<HTMLButtonElement>('[data-cookie-choice="declined"]')?.focus(); };
  notice.querySelector('[data-cookie-dismiss]')?.addEventListener('click', () => { notice.hidden = true; reopen.hidden = false; reopen.focus(); });
  reopen.addEventListener('click', show);
  window.addEventListener('site-cookie-settings', show);
  notice.querySelectorAll<HTMLButtonElement>('[data-cookie-choice]').forEach(button => button.addEventListener('click', async () => {
    const controls = notice.querySelectorAll<HTMLButtonElement>('button');
    controls.forEach(control => { control.disabled = true; });
    const status = notice.querySelector<HTMLElement>('.cookie-choice-status')!; status.textContent = '';
    try {
      const response = await fetch('/api/chat/consent', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Chat-Language': el ? 'el' : 'en' },
        body: JSON.stringify({ choice: button.dataset.cookieChoice }), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('consent');
      const choice = readChatConsent();
      if (choice !== button.dataset.cookieChoice) throw new Error('cookie-blocked');
      window.dispatchEvent(new CustomEvent('site-cookie-choice', { detail: choice }));
      channel?.postMessage(choice);
      notice.hidden = true; reopen.hidden = false; reopen.focus();
    } catch {
      status.textContent = el ? 'Η επιλογή σας δεν αποθηκεύτηκε. Ελέγξτε ότι επιτρέπονται τα cookies και δοκιμάστε ξανά.' : 'Your choice could not be saved. Check that cookies are allowed and try again.';
    } finally { controls.forEach(control => { control.disabled = false; }); }
  }));
}
