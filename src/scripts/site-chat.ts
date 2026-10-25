import {CHAT_STARTERS} from '../lib/chat/starters';
import { hasChatConsent } from '../lib/chat/consent';
import { chatText } from '../lib/chat/copy';
import { LIMITS, CHAT_TIMING, uniqueCitations } from '../lib/chat/policy';
import { eventData, type ChatStreamEvent } from '../lib/chat/stream';
import { THINKING_WORDS, GREEK_THINKING_WORDS } from '../lib/chat/thinking';
import { modelLabel } from '../lib/chat/model-label';
import { PERSONAS, isPersona, type Persona } from '../lib/chat/personas';
import { mentionAt, MAX_ATTACHED_SOURCES, isIndexedSource, type ChatSource } from '../lib/chat/sources';
import { renderChatMarkdown, chatPlainText } from '../lib/chat/markdown';
import { safeChatLink, externalChatDestination, chatCitationHref, officePresentationFile } from '../lib/chat/links';
import { replyFiles, replyZip } from '../lib/chat/downloads';
type ChatData = { error?: string; threads: Thread[]; enabled: boolean; remaining: number; globalRemaining: number; messages: ChatMessage[]; thread: Thread; id: string; turnstileSiteKey: string | null; recorded?: boolean; resetsAt: number; globalResetsAt: number; timeZone: string };
type Thread = { id: string; title: string; archived: number; questions: number; updated_at: number; persona?: Persona };
export {};
type ChatMessage = { id: string; question: string; answer: string | null; sources: { title: string; url: string }[]; context_sources?: { title: string; url: string }[]; status: string; model?: string | null; persona?: Persona };
type Turnstile = { render: (target: HTMLElement, options: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
class ChatRequestError extends Error { constructor(message: string, public recorded = false) { super(message); } }
class SiteChat extends HTMLElement {
  private threads: Thread[] = [];
  private active = '';
  private archived = false;
  private editingId = '';
  private renameDraft = '';
  private renameSaving = false;
  private renameError = '';
  private busy = false;
  private running = new Map<string, { messages: ChatMessage[]; turns: number; persona: Persona; progress: 'searching' | 'thinking' }>();
  private unconfirmedThreads = new Set<string>();
  private drafts = new Map<string, { text: string; attached: ChatSource[] }>();
  private viewVersion = 0;
  private detailRequest = 0;
  private loadingThread = '';
  private threadLoadFailed = false;
  private get loadingConversation() { return !!this.active && this.loadingThread === this.active; }
  private listRequest = 0;
  private pendingTitles = new Map<string, { fallback: string; expires: number }>();
  private titleTimer?: ReturnType<typeof setTimeout>;
  private scheduleTitles() {
    clearTimeout(this.titleTimer);
    for (const [id, pending] of this.pendingTitles) if (Date.now() >= pending.expires) this.pendingTitles.delete(id);
    if (!this.pendingTitles.size || !this.isConnected || !hasChatConsent()) return;
    this.titleTimer = setTimeout(() => { void this.load(false); }, 2000);
  }
  private get answering() { return this.running.has(this.active); }

  private ready = false;
  private persona: Persona = 'baseline';
  private personaSaving = false;
  private personaNavigation = false;
  private attached: ChatSource[] = [];
  private sourceResults: ChatSource[] = [];
  private sourceIndex = 0;
  private sourceTimer?: ReturnType<typeof setTimeout>;
  private sourceRequest?: AbortController;
  private sourceRange: ReturnType<typeof mentionAt> = null;
  private tourStep = 0;
  private tourFocus: HTMLElement | null = null;
  private copyTimer?: ReturnType<typeof setTimeout>;
  private downloads = new Map<string, AbortController>();
  private closeMenus(except?: Element, restoreFocus = false) {
    for (const menu of this.querySelectorAll<HTMLDetailsElement>('.chat-thread-menu[open],.chat-persona-picker[open],.chat-copy-menu[open],.chat-download-menu[open]')) {
      if (except && menu.contains(except)) continue;
      menu.open = false;
      if (restoreFocus) menu.querySelector('summary')?.focus();
    }
  }
  private onMenuOutside = (event: Event) => {
    const target = event.target instanceof Element ? event.target : undefined;
    this.closeMenus(target);
    if (target !== this.input && !target?.closest('.chat-mention-menu,[data-action="mention"]')) this.closeSources();
  };
  private onMenuEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !this.q('.chat-mention-menu').hidden) { event.preventDefault(); this.closeSources(); this.input.focus(); return; }
    if (event.key === 'Escape' && this.querySelector('.chat-thread-menu[open],.chat-persona-picker[open],.chat-copy-menu[open],.chat-download-menu[open]')) {
      event.preventDefault(); this.closeMenus(undefined, true);
    }
  };
  private enabled = false;
  private remaining = 10;
  private globalRemaining = 200;
  private turns = 0;
  private timeZone = 'UTC';
  private resetsAt = 0;
  private globalResetsAt = 0;
  private resetTimer?: ReturnType<typeof setTimeout>;
  private messages: ChatMessage[] = [];
  private progress: 'searching' | 'thinking' = 'searching';
  private thinkingTimer?: ReturnType<typeof setInterval>;
  private thinkingIndex = 0;
  private thinkingLabel() {
    if (this.progress === 'searching') return this.t('Searching the site', 'Ψάχνω στον ιστότοπο');
    const words = this.el ? GREEK_THINKING_WORDS : THINKING_WORDS;
    return words[this.thinkingIndex % words.length] + '…';
  }
  private stopThinking() { clearInterval(this.thinkingTimer); this.thinkingTimer = undefined; }
  private syncThinking() {
    if (!this.querySelector('.chat-thinking')) { this.stopThinking(); return; }
    if (this.thinkingTimer) return;
    const words = this.el ? GREEK_THINKING_WORDS : THINKING_WORDS;
    this.thinkingIndex = Math.floor(Math.random() * words.length);
    this.thinkingTimer = setInterval(() => {
      const label = this.querySelector('.chat-thinking-label');
      if (!label || !this.isConnected || !hasChatConsent()) { this.stopThinking(); return; }
      this.thinkingIndex = (this.thinkingIndex + 1) % words.length;
      label.textContent = this.thinkingLabel();
    }, 2400);
  }
  private retries = new Map<string, { question: string; id: string; sourceKey: string }>();
  private pollTimer?: ReturnType<typeof setTimeout>;
  private el = false;
  private challengeToken = '';
  private challengeKey = '';
  private challengeId?: string;
  private challengeLoading = false;
  private noticeSource: 'general' | 'challenge' = 'general';
  private t(en: string, el: string) { return this.el ? el : en; }
  private q<T extends HTMLElement = HTMLElement>(selector: string) { return this.querySelector<T>(selector)!; }
  private get panel() { return this.q<HTMLElement>('.chat-shell'); }
  private inputObserver?: ResizeObserver;
  private panelAnimation?: Animation;
  private panelOpen = false;
  private onViewportResize = () => { if (this.dataset.mode === 'bubble') this.fitPanel(); };
  private saveDraft = () => { if (!hasChatConsent()) return; this.drafts.set(this.active, { text: this.input.value, attached: [...this.attached] }); try { sessionStorage.setItem('site-chat-draft', this.input.value); sessionStorage.setItem('site-chat-sources', JSON.stringify(this.attached)); } catch {} };
  private get input() { return this.q<HTMLTextAreaElement>('textarea'); }
  connectedCallback() {
    document.addEventListener('pointerdown', this.onMenuOutside);
    document.addEventListener('click', this.onMenuOutside);
    document.addEventListener('focusin', this.onMenuOutside);
    document.addEventListener('keydown', this.onMenuEscape);
    if (this.ready) return;
    this.ready = true;
    this.el = this.dataset.lang === 'el';
    if (hasChatConsent()) try {
      this.input.value = (sessionStorage.getItem('site-chat-draft') || '').slice(0, LIMITS.question);
      const sources: unknown = JSON.parse(sessionStorage.getItem('site-chat-sources') || '[]');
      if (Array.isArray(sources)) this.attached = sources.filter((s): s is ChatSource => s && typeof s.title === 'string' && s.title.length <= 400 && typeof s.url === 'string' && isIndexedSource(s.url) && ['page', 'file'].includes(s.kind)).slice(0, MAX_ATTACHED_SOURCES);
    } catch {}
    this.renderAttachments();
    this.q('.chat-length').textContent = `${this.input.value.length} / ${LIMITS.question}`;
    if (hasChatConsent()) try { const saved = sessionStorage.getItem('site-chat-persona'); if (isPersona(saved)) this.persona = saved; } catch {}
    this.renderPersona();
    if (this.dataset.mode === 'bubble' || matchMedia('(max-width: 600px)').matches) {
      this.classList.add('chat-hide-history');
      this.q('[data-action="history"]').setAttribute('aria-expanded', 'false');
    }
    if (hasChatConsent()) { try { this.active = sessionStorage.getItem('site-chat-active') || ''; } catch {} }
    this.applyConsent();
    window.addEventListener('site-cookie-choice', this.onConsentChange);
    this.addEventListener('click', event => { void this.followChatLink(event); });
    this.addEventListener('auxclick', event => { if (event.button === 1) void this.followChatLink(event); });
    this.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.target as Element).closest('a[data-chat-href]')) void this.followChatLink(event);
    });
    this.addEventListener('click', e => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target) { this.closeMenus(); void this.action(target.dataset.action!, target.dataset.id); }
    });
    this.addEventListener('change', event => {
      const input = event.target;
      if (!this.personaNavigation && input instanceof HTMLInputElement && input.closest('.chat-persona-options') && isPersona(input.value)) void this.choosePersona(input.value);
    });
    this.q('.chat-persona-options').addEventListener('pointerdown', () => { this.personaNavigation = false; });
    this.q('.chat-persona-options').addEventListener('keydown', event => {
      const key = event as KeyboardEvent, input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (key.key.startsWith('Arrow')) this.personaNavigation = true;
      if ((key.key === 'Enter' || key.key === ' ') && isPersona(input.value)) { key.preventDefault(); void this.choosePersona(input.value); }
    });
    this.q<HTMLDetailsElement>('.chat-persona-picker').addEventListener('toggle', () => {
      const picker = this.q<HTMLDetailsElement>('.chat-persona-picker');
      if (!picker.open) { this.personaNavigation = false; this.renderPersona(); return; }
      this.closeMenus(picker);
      const available = picker.getBoundingClientRect().top - this.q('.chat-workspace').getBoundingClientRect().top - 12;
      this.q<HTMLElement>('.chat-persona-options').style.maxHeight = `${Math.max(120, Math.min(340, available))}px`;
    });
    if (this.dataset.mode === 'bubble') this.setupPanel();
    this.q('form.chat-compose').addEventListener('submit', e => { e.preventDefault(); void this.send(); });
    this.addEventListener('submit', e => {
      const form = e.target as HTMLFormElement;
      if (form.matches('.chat-thread-rename')) { e.preventDefault(); void this.rename(); }
    });
    this.input.setAttribute('role', 'combobox'); this.input.setAttribute('aria-autocomplete', 'list'); this.input.setAttribute('aria-expanded', 'false'); this.input.setAttribute('aria-controls', this.q('.chat-mention-menu').id);
    this.input.addEventListener('input', () => { this.resizeInput(); this.saveDraft(); this.q('.chat-length').textContent = `${this.input.value.length} / ${LIMITS.question}`; this.updateControls(); this.updateSources(); });
    this.input.addEventListener('click', () => this.updateSources());
    this.input.addEventListener('keyup', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) this.updateSources(); });
    this.q('.chat-mention-menu').addEventListener('pointerdown', event => event.preventDefault());
    this.q('.chat-mention-menu').addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLElement>('[data-source-index]');
      if (button) this.attachSource(Number(button.dataset.sourceIndex));
    });
    this.q('.chat-selected-sources').addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLElement>('[data-remove-source]');
      if (!button || this.busy) return;
      this.attached = this.attached.filter(source => source.url !== button.dataset.removeSource); this.renderAttachments(); this.saveDraft(); this.input.focus();
    });
    this.q('.chat-tour').addEventListener('click', event => {
      const action = (event.target as Element).closest<HTMLElement>('[data-tour]')?.dataset.tour;
      if (action === 'dismiss' || (action === 'next' && this.tourStep === this.tourSteps().length - 1)) this.q<HTMLDialogElement>('.chat-tour').close();
      else if (action === 'next' || action === 'back') { this.tourStep = Math.max(0, Math.min(this.tourSteps().length - 1, this.tourStep + (action === 'next' ? 1 : -1))); this.renderTour(); }
    });
    this.q('.chat-tour').addEventListener('close', () => { if (hasChatConsent()) try { localStorage.setItem('site-chat-tour-v1', 'seen'); } catch {} this.tourFocus?.focus(); });
    this.input.addEventListener('keydown', e => {
      if (!this.q('.chat-mention-menu').hidden && !e.isComposing) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeSources(); return; }
        if (e.key === 'Tab') { this.closeSources(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.sourceIndex = (this.sourceIndex + (e.key === 'ArrowDown' ? 1 : -1) + this.sourceResults.length) % Math.max(1, this.sourceResults.length); this.highlightSource(); return; }
        if (e.key === 'Enter') { e.preventDefault(); if (this.sourceResults.length) this.attachSource(this.sourceIndex); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void this.send(); }
    });
    let inputWidth = -1;
    this.inputObserver = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== inputWidth) { inputWidth = entry.contentRect.width; this.resizeInput(); }
    });
    this.inputObserver.observe(this.input);
    this.resizeInput();
    if (this.dataset.mode === 'page') void this.load();
  }
  disconnectedCallback() { clearTimeout(this.titleTimer); this.downloads.forEach(controller => controller.abort()); this.downloads.clear(); clearTimeout(this.copyTimer); this.closeSources(); document.removeEventListener('pointerdown', this.onMenuOutside); document.removeEventListener('click', this.onMenuOutside); document.removeEventListener('focusin', this.onMenuOutside); document.removeEventListener('keydown', this.onMenuEscape); this.stopThinking(); window.removeEventListener('site-cookie-choice', this.onConsentChange); this.inputObserver?.disconnect(); clearTimeout(this.pollTimer); clearTimeout(this.resetTimer); this.panelAnimation?.cancel(); window.removeEventListener('resize', this.onViewportResize); window.removeEventListener('pagehide', this.saveDraft); if (this.challengeId) window.turnstile?.remove(this.challengeId); }
  private onConsentChange = () => {
    const accepted = this.applyConsent();
    if (accepted) { if (this.dataset.mode === 'page' || this.panelOpen) void this.load(); }
    else {
      this.stopThinking(); clearTimeout(this.copyTimer); clearTimeout(this.pollTimer); clearTimeout(this.resetTimer);
      this.downloads.forEach(controller => controller.abort()); this.downloads.clear();
      this.enabled = false; this.threads = []; this.messages = []; this.active = ''; this.editingId = ''; this.turns = 0; this.retries.clear(); this.running.clear(); this.pendingTitles.clear(); clearTimeout(this.titleTimer); this.unconfirmedThreads.clear(); this.drafts.clear(); this.viewVersion++;
      this.persona = 'baseline'; this.renderPersona(); this.closeMenus();
      this.attached = []; this.renderAttachments(); this.closeSources(); this.q<HTMLDialogElement>('.chat-tour').close();
      this.input.value = ''; this.q('.chat-thread-list').replaceChildren(); this.q('.chat-messages').replaceChildren();
      this.q('.chat-notice').textContent = ''; this.q<HTMLDialogElement>('.chat-confirm').close();
      if (this.challengeId) window.turnstile?.remove(this.challengeId);
      this.challengeId = undefined; this.challengeToken = ''; this.challengeKey = ''; this.q('.chat-challenge').hidden = true;
      try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const key = sessionStorage.key(i); if (key?.startsWith('site-chat-')) sessionStorage.removeItem(key); } } catch {}
    }
  };
  private applyConsent() {
    const accepted = hasChatConsent();
    this.q('.chat-consent-gate').hidden = accepted;
    this.q('.chat-conversation').hidden = !accepted;
    this.q('.chat-sidebar').hidden = !accepted;
    this.q<HTMLButtonElement>('[data-action="history"]').disabled = !accepted;
    this.q<HTMLButtonElement>('.chat-header-new').disabled = !accepted;
    this.input.disabled = !accepted || this.busy || this.answering || this.loadingConversation || this.threadLoadFailed || !this.enabled;
    return accepted;
  }
  private resizeInput() {
    if (!this.input.clientWidth) return;
    const line = parseFloat(getComputedStyle(this.input).lineHeight) || 22;
    this.input.style.height = '0px';
    const contentHeight = this.input.scrollHeight;
    this.input.style.height = `${Math.max(line, Math.min(line * 2, contentHeight))}px`;
    this.input.style.overflowY = contentHeight > line * 2 ? 'auto' : 'hidden';
  }
  private closeSources() {
    clearTimeout(this.sourceTimer); this.sourceRequest?.abort(); this.sourceRange = null;
    this.q('.chat-mention-menu').hidden = true; this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant');
  }
  private updateSources() {
    const range = mentionAt(this.input.value, this.input.selectionStart);
    if (!range || this.input.disabled || !hasChatConsent()) { this.closeSources(); return; }
    clearTimeout(this.sourceTimer); this.sourceRequest?.abort();
    this.sourceRange = range; this.sourceResults = []; this.sourceIndex = 0;
    this.closeMenus();
    const menu = this.q('.chat-mention-menu'); menu.hidden = false;
    menu.style.maxHeight = `${Math.max(120, Math.min(380, this.q('.chat-compose').getBoundingClientRect().top - this.q('.chat-workspace').getBoundingClientRect().top - 12))}px`;
    menu.replaceChildren(this.node('p', 'chat-source-empty', this.t('Finding pages and files…', 'Αναζήτηση σελίδων και αρχείων…')));
    this.input.setAttribute('aria-expanded', 'true'); this.input.removeAttribute('aria-activedescendant');
    this.sourceTimer = setTimeout(() => { void this.findSources(range); }, 160);
  }
  private async findSources(range: NonNullable<ReturnType<typeof mentionAt>>) {
    const controller = new AbortController(); this.sourceRequest = controller;
    try {
      const response = await fetch(`/api/chat/?sources=${encodeURIComponent(range.query)}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'X-Chat-Language': this.el ? 'el' : 'en' } });
      if (!response.ok) throw new Error('sources');
      const data = await response.json() as { sources: ChatSource[] };
      if (controller.signal.aborted || this.sourceRange !== range || !hasChatConsent()) return;
      this.sourceResults = data.sources.filter(source => isIndexedSource(source.url) && !this.attached.some(s => s.url === source.url)); this.sourceIndex = 0;
      const menu = this.q('.chat-mention-menu'); menu.replaceChildren();
      const header = this.node('div', 'chat-source-heading'); this.add(header, this.node('strong', '', this.t('Bring a source into the chat', 'Επιλέξτε πηγή για την ερώτησή σας')), this.node('small', '', this.t('Type after @ to filter · ↑ ↓ browse · Enter attach', 'Γράψτε μετά το @ για αναζήτηση · ↑ ↓ επιλογή · Enter προσθήκη'))); this.add(menu, header);
      for (const kind of ['page', 'file'] as const) {
        if (!this.sourceResults.some(source => source.kind === kind)) continue;
        const group = this.node('div', 'chat-source-group'); group.setAttribute('role', 'group');
        const label = kind === 'page' ? this.t('Pages', 'Σελίδες') : this.t('Files', 'Αρχεία'); group.setAttribute('aria-label', label);
        this.add(group, this.node('p', 'chat-source-group-title', label));
        this.sourceResults.forEach((source, index) => {
          if (source.kind !== kind) return;
          const button = this.node('button', 'chat-source-option') as HTMLButtonElement;
          button.type = 'button'; button.tabIndex = -1; button.id = `${menu.id}-${index}`; button.dataset.sourceIndex = String(index); button.setAttribute('role', 'option'); button.title = source.title;
          this.add(button, this.icon(kind === 'file' ? 'file' : 'page'));
          const copy = this.node('span', ''); this.add(copy, this.node('strong', '', source.title), this.node('small', '', source.url)); this.add(button, copy); this.add(group, button);
        });
        this.add(menu, group);
      }
      if (!this.sourceResults.length) this.add(menu, this.node('p', 'chat-source-empty', this.t('No matching pages or files.', 'Δεν βρέθηκαν σελίδες ή αρχεία.')));
      this.q('.chat-source-status').textContent = this.sourceResults.length === 1 ? this.t('One source found.', 'Βρέθηκε μία πηγή.') : this.t(`${this.sourceResults.length} sources found.`, `Βρέθηκαν ${this.sourceResults.length} πηγές.`);
      this.highlightSource();
    } catch {
      if (!controller.signal.aborted && this.sourceRange === range) this.q('.chat-mention-menu').replaceChildren(this.node('p', 'chat-source-empty', this.t('Sources could not load. Try typing @ again.', 'Δεν φορτώθηκαν οι πηγές. Δοκιμάστε ξανά με @.')));
    }
  }
  private highlightSource() {
    this.querySelectorAll<HTMLElement>('[data-source-index]').forEach((option, index) => {
      option.setAttribute('aria-selected', String(index === this.sourceIndex));
      if (index === this.sourceIndex) { this.input.setAttribute('aria-activedescendant', option.id); option.scrollIntoView({ block: 'nearest' }); }
    });
  }
  private attachSource(index: number) {
    const source = this.sourceResults[index], range = this.sourceRange;
    if (!source || !range || this.busy) return;
    if (this.attached.length >= MAX_ATTACHED_SOURCES) { this.q('.chat-source-status').textContent = this.t('Attach up to five sources per question.', 'Μπορείτε να προσθέσετε έως πέντε πηγές ανά ερώτηση.'); this.notice(this.t('Attach up to five sources per question.', 'Μπορείτε να προσθέσετε έως πέντε πηγές ανά ερώτηση.')); this.closeSources(); return; }
    if (!this.attached.some(s => s.url === source.url)) this.attached.push(source);
    this.input.setRangeText('', range.start, range.end, 'end');
    this.closeSources(); this.renderAttachments(); this.input.dispatchEvent(new Event('input')); this.input.focus();
    this.q('.chat-source-status').textContent = this.t(`Attached ${source.title}.`, `Προστέθηκε η πηγή: ${source.title}.`);
  }
  private renderAttachments() {
    const area = this.q('.chat-selected-sources'); area.replaceChildren(); area.hidden = !this.attached.length;
    for (const source of this.attached) {
      const chip = this.node('span', 'chat-source-chip'); chip.title = source.title;
      this.add(chip, this.icon(source.kind === 'file' ? 'file' : 'page'), this.node('span', '', source.title));
      const remove = this.node('button', '', '×') as HTMLButtonElement; remove.type = 'button'; remove.dataset.removeSource = source.url; remove.disabled = this.busy;
      remove.setAttribute('aria-label', this.t(`Remove ${source.title}`, `Αφαίρεση: ${source.title}`)); this.add(chip, remove); this.add(area, chip);
    }
  }
  private openMention() {
    if (this.input.disabled) return;
    this.input.focus();
    const current = mentionAt(this.input.value, this.input.selectionStart);
    if (!current) {
      const existing = /(?:^|\s)@/.exec(this.input.value);
      if (existing) { const caret = existing.index + existing[0].length; this.input.setSelectionRange(caret, caret); }
      else {
        const caret = this.input.selectionStart, prefix = caret && !/\s/.test(this.input.value[caret - 1]) ? ' @' : '@';
        if (this.input.value.length + prefix.length > LIMITS.question) { this.notice(this.t('Make a little room for @ first.', 'Αφήστε λίγο χώρο για το @.')); return; }
        this.input.setRangeText(prefix, caret, this.input.selectionEnd, 'end');
      }
    }
    this.input.dispatchEvent(new Event('input'));
  }
  private openTour() {
    if (!hasChatConsent()) return;
    this.closeMenus(); this.closeSources(); this.tourStep = 0; this.tourFocus = document.activeElement as HTMLElement;
    this.renderTour(); const dialog = this.q<HTMLDialogElement>('.chat-tour'); if (!dialog.open) dialog.showModal();
  }
  private tourSteps() {
    return [
      [this.t('A little more about me.', 'Ας γνωριστούμε λίγο καλύτερα.'), this.t('Ask about my work, background, research, or Formula 1 writing. First, the assistant checks whether your question is about me or this site. Then it finds relevant material and writes an answer, linking published sources where available. Follow the links for the full picture.', 'Ρωτήστε για τη δουλειά, τη διαδρομή, την έρευνά μου ή τα άρθρα για τη Formula 1. Ο βοηθός ελέγχει πρώτα αν η ερώτηση αφορά εμένα ή τον ιστότοπο. Μετά βρίσκει το σχετικό υλικό και συνθέτει την απάντηση, με συνδέσμους στις δημοσιευμένες πηγές όπου υπάρχουν.'), 'page'],
      [this.t('Point to what you mean.', 'Δείξτε τι έχετε κατά νου.'), this.t('Type @ followed by a topic to filter pages and files, including CVs, papers and presentations. You’ll see up to five matches of each kind. Attach up to five sources to keep the next question focused on that material. Remove a source with ×, or open the menu with Sources.', 'Γράψτε @ και μετά ένα θέμα για να φιλτράρετε σελίδες και αρχεία, όπως βιογραφικά, εργασίες και παρουσιάσεις. Θα δείτε έως πέντε αποτελέσματα ανά κατηγορία. Προσθέστε έως πέντε πηγές για να βασιστεί η επόμενη απάντηση σε αυτό το υλικό. Αφαιρέστε μια πηγή με το × ή ανοίξτε το μενού από τις «Πηγές».'), 'mention'],
      [this.t('Your kind of delivery.', 'Στο ύφος που σας ταιριάζει.'), this.t('Open Style to choose Baseline, Fun, Race Engineer, Formal, or Quick Take. The choice applies to the next answer in this chat. Earlier replies keep their style; the facts and allowed topics stay the same.', 'Από το «Ύφος» διαλέξτε απλό ύφος, χιούμορ, μηχανικό αγώνα, επίσημο ύφος ή σύντομη απάντηση. Η επιλογή ισχύει από την επόμενη απάντηση αυτής της συνομιλίας. Οι προηγούμενες απαντήσεις μένουν όπως είναι και τα θέματα που καλύπτει ο βοηθός δεν αλλάζουν.'), 'persona'],
      [this.t('Take something with you.', 'Κρατήστε ό,τι σας χρειάζεται.'), this.t('Under each reply, copy the text as Markdown or plain text. Download the referenced files individually, or together as a ZIP when there are several. Unavailable download options stay dimmed. Links to another website ask you to confirm before leaving.', 'Κάτω από κάθε απάντηση, αντιγράψτε το κείμενο σε Markdown ή ως απλό κείμενο. Κατεβάστε τα αρχεία που αναφέρονται ξεχωριστά ή μαζί σε ZIP, όταν είναι περισσότερα από ένα. Οι μη διαθέσιμες επιλογές εμφανίζονται ανενεργές. Πριν ανοίξει σύνδεσμος προς άλλον ιστότοπο, θα σας ζητηθεί επιβεβαίωση.'), 'download'],
      [this.t('Keep exploring.', 'Συνεχίστε την εξερεύνηση.'), this.t('You can switch chats or start a new one while a reply is being written. Return to the original chat to see its progress. With the chat bubble, keep browsing the site, minimize it back to its button, or drag its edges to resize. Use ↗ to open the full chat page.', 'Μπορείτε να αλλάξετε συνομιλία ή να ξεκινήσετε νέα όσο γράφεται μια απάντηση. Επιστρέψτε στην αρχική για να δείτε την πρόοδό της. Με το μικρό παράθυρο συνομιλίας μπορείτε να περιηγείστε στον ιστότοπο, να το ελαχιστοποιείτε ή να σύρετε τις άκρες του για αλλαγή μεγέθους. Το ↗ ανοίγει την πλήρη σελίδα συνομιλίας.'), 'external'],
      [this.t('A few good questions.', 'Λίγες καλές ερωτήσεις.'), this.t('Four questions per chat; ten per day shared by your IP, resetting at local midnight. The site has 200 shared questions per UTC day. Rename, archive or delete chats from ⋯. When a chat fills up, start another or use the contact link to continue the discussion with me.', 'Τέσσερις ερωτήσεις ανά συνομιλία και δέκα την ημέρα, από κοινού με όσους χρησιμοποιούν την ίδια IP, με ανανέωση τα τοπικά μεσάνυχτα. Ο ιστότοπος διαθέτει συνολικά 200 ερωτήσεις την ημέρα, με ανανέωση τα μεσάνυχτα UTC. Από το ⋯ αλλάξτε τίτλο, αρχειοθετήστε ή διαγράψτε μια συνομιλία. Όταν συμπληρωθούν οι τέσσερις ερωτήσεις, ξεκινήστε νέα ή επικοινωνήστε μαζί μου από τον σχετικό σύνδεσμο.'), 'history'],
    ];
  }
  private renderTour() {
    const steps = this.tourSteps();
    const [title, description, visual] = steps[this.tourStep];
    const dialog = this.q('.chat-tour'); dialog.querySelector('h2')!.textContent = title;
    this.q('.chat-tour-description').textContent = description;
    this.q('.chat-tour-step').textContent = this.t(`AI ASSISTANT · ${this.tourStep + 1} OF ${steps.length}`, `ΒΟΗΘΟΣ AI · ${this.tourStep + 1} ΑΠΟ ${steps.length}`);
    const art = this.q('.chat-tour-visual'); art.replaceChildren(visual === 'mention' ? this.node('span', '', '@') : this.icon(visual));
    const dots = this.q('.chat-tour-dots'); dots.replaceChildren();
    steps.forEach((_, index) => { const dot = this.node('span', ''); dot.classList.toggle('is-current', index === this.tourStep); this.add(dots, dot); });
    this.q<HTMLButtonElement>('[data-tour="back"]').hidden = this.tourStep === 0;
    this.q('[data-tour="next"]').textContent = this.tourStep === steps.length - 1 ? this.t('Done', 'Έτοιμο') : this.t('Next', 'Επόμενο');
  }
  private panelBounds() {
    const width = window.innerWidth, height = window.innerHeight;
    const maxWidth = Math.min(760, width >= 1100 ? width * .48 : width - 32);
    const maxHeight = Math.min(820, width <= 600 ? height * .72 : height - 112);
    return { minWidth: Math.min(340, maxWidth), maxWidth, minHeight: Math.min(480, maxHeight), maxHeight };
  }
  private setupPanel() {
    const launcher = this.q<HTMLButtonElement>('.chat-launcher');
    launcher.addEventListener('click', () => { void this.togglePanel(!this.panelOpen); });
    if (hasChatConsent()) try {
      const size = JSON.parse(sessionStorage.getItem('site-chat-size') || 'null');
      if (Number.isFinite(size?.width) && Number.isFinite(size?.height)) {
        this.panel.style.width = `${size.width}px`; this.panel.style.height = `${size.height}px`;
      }
      this.input.value = (sessionStorage.getItem('site-chat-draft') || '').slice(0, LIMITS.question);
      this.q('.chat-length').textContent = `${this.input.value.length} / ${LIMITS.question}`;
      if (sessionStorage.getItem('site-chat-open') === 'true') void this.togglePanel(true, false);
    } catch {}
    this.addEventListener('pointerdown', event => this.startResize(event));
    this.q('.chat-resize-keyboard').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const rect = this.panel.getBoundingClientRect(), step = event.shiftKey ? 48 : 16;
      this.setPanelSize(rect.width + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0), rect.height + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0));
    });
    window.addEventListener('resize', this.onViewportResize);
    window.addEventListener('pagehide', this.saveDraft);
  }
  private setPanelSize(width: number, height: number) {
    const b = this.panelBounds();
    width = Math.max(b.minWidth, Math.min(b.maxWidth, width)); height = Math.max(b.minHeight, Math.min(b.maxHeight, height));
    this.panel.style.width = `${width}px`; this.panel.style.height = `${height}px`;
    if (hasChatConsent()) try { sessionStorage.setItem('site-chat-size', JSON.stringify({ width, height })); } catch {}
  }
  private fitPanel() {
    if (!this.panelOpen) return;
    const rect = this.panel.getBoundingClientRect();
    this.panel.style.right = ''; this.panel.style.bottom = '';
    this.setPanelSize(rect.width || 420, rect.height || 620);
  }
  private async togglePanel(open: boolean, animate = true) {
    this.panelAnimation?.cancel(); this.panelOpen = open;
    if (hasChatConsent()) try { sessionStorage.setItem('site-chat-open', String(open)); } catch {}
    const launcher = this.q<HTMLButtonElement>('.chat-launcher');
    launcher.setAttribute('aria-expanded', String(open));
    this.classList.toggle('chat-is-open', open);
    if (open) { this.panel.hidden = false; this.fitPanel(); void this.load(); }
    const rect = this.panel.getBoundingClientRect(), bubble = launcher.getBoundingClientRect();
    const small = { transform: `translate(${bubble.right - rect.right}px, ${bubble.bottom - rect.bottom}px) scale(${bubble.width / rect.width}, ${bubble.height / rect.height})`, opacity: 0, borderRadius: '40px' };
    const large = { transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '16px' };
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.panelAnimation = this.panel.animate(open ? [small, large] : [large, small], { duration: open ? 280 : 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
      try { await this.panelAnimation.finished; } catch { return; }
    }
    if (!open) { this.panel.hidden = true; launcher.focus(); }
  }
  private startResize(event: PointerEvent) {
    const handle = (event.target as Element).closest<HTMLElement>('[data-resize]');
    if (!handle || !this.panelOpen || event.button !== 0) return;
    event.preventDefault();
    const edge = handle.dataset.resize!, start = this.panel.getBoundingClientRect();
    const startX = event.clientX, startY = event.clientY;
    handle.setPointerCapture(event.pointerId); this.classList.add('chat-is-resizing');
    const move = (next: PointerEvent) => {
      const b = this.panelBounds(), dx = next.clientX - startX, dy = next.clientY - startY;
      let width = Math.max(b.minWidth, Math.min(b.maxWidth, start.width + (edge.includes('w') ? -dx : edge.includes('e') ? dx : 0)));
      let height = Math.max(b.minHeight, Math.min(b.maxHeight, start.height + (edge.includes('n') ? -dy : edge.includes('s') ? dy : 0)));
      const left = edge.includes('w') ? Math.max(16, start.right - width) : start.left;
      const top = edge.includes('n') ? Math.max(16, start.bottom - height) : start.top;
      width = Math.min(width, window.innerWidth - left - 16); height = Math.min(height, window.innerHeight - top - 80);
      this.panel.style.right = `${window.innerWidth - left - width}px`;
      this.panel.style.bottom = `${window.innerHeight - top - height}px`;
      this.setPanelSize(width, height);
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', stop);
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      this.classList.remove('chat-is-resizing');
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', stop);
  }
  private async api(body?: object, id?: string, onEvent?: (event: ChatStreamEvent) => void): Promise<ChatData> {
    if (!hasChatConsent()) throw new ChatRequestError(this.t('Accept cookies to use the chat.', 'Για να χρησιμοποιήσετε τη συνομιλία, χρειάζεται να αποδεχτείτε τα cookies.'));
    const response = await fetch('/api/chat/' + (id ? `?id=${encodeURIComponent(id)}` : ''), {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'X-Chat-Language': this.el ? 'el' : 'en', 'X-Chat-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(CHAT_TIMING.request),
    });
    if (response.ok && response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
      let complete = false;
      for await (const data of eventData(response.body)) {
        const event = JSON.parse(data) as ChatStreamEvent;
        if (!hasChatConsent()) throw new ChatRequestError(this.t('Accept cookies to use the chat.', 'Για να χρησιμοποιήσετε τη συνομιλία, χρειάζεται να αποδεχτείτε τα cookies.'));
        if (event.type === 'error') throw new ChatRequestError(event.error, event.recorded);
        if (event.type === 'done') complete = true;
        onEvent?.(event);
        if (complete) break; // A separate title task must not lock a finished answer.
      }
      if (!complete) throw new ChatRequestError(this.t('The connection was interrupted. Reopen the conversation to check the answer.', 'Η σύνδεση διακόπηκε. Ανοίξτε ξανά τη συνομιλία για να δείτε την απάντηση.'));
      // Streaming callers use events; retain the same return shape as JSON calls.
      return { ok: true } as unknown as ChatData;
    }
    const data = await response.json() as ChatData;
    if (!response.ok) throw new ChatRequestError(data.error || this.t('The guide is unavailable.', 'Ο βοηθός δεν είναι διαθέσιμος αυτή τη στιγμή.'), data.recorded);
    return data;
  }
  private notice(message: string, source: 'general' | 'challenge' = 'general') { this.noticeSource = source; this.q('.chat-notice').textContent = message; }
  private clearChallengeNotice() { if (this.noticeSource === 'challenge') this.notice(''); }
  private renderLiveAnswer(message: ChatMessage) {
    if (!message.answer || message.status === 'done') { this.renderMessages(false); return; }
    const area = this.q('.chat-messages');
    const follow = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    const reply = area.lastElementChild;
    if (!reply?.classList.contains('chat-assistant')) return;
    reply.querySelector('.chat-thinking')?.remove();
    this.stopThinking();
    let text = reply.querySelector<HTMLElement>('.chat-answer-content');
    if (!text) { text = this.node('div', 'chat-answer-content'); reply.appendChild(text); }
    renderChatMarkdown(text, message.answer);
    if (follow) area.scrollTo({ top: area.scrollHeight, behavior: 'instant' });
  }
  private async load(refreshMessages = true) {
    if (!this.applyConsent()) return;
    const request = ++this.listRequest;
    try {
      const data = await this.api();
      if (!hasChatConsent() || request !== this.listRequest) return;
      const local = this.threads.filter(thread => !data.threads.some(t => t.id === thread.id) && (this.unconfirmedThreads.has(thread.id) || this.running.has(thread.id)));
      this.threads = [...data.threads, ...local]; this.enabled = data.enabled;
      for (const [id, pending] of this.pendingTitles) {
        const title = this.threads.find(thread => thread.id === id)?.title;
        if (Date.now() >= pending.expires || (title && title !== 'New conversation' && title !== pending.fallback)) this.pendingTitles.delete(id);
      }
      this.scheduleTitles();
      this.remaining = data.remaining; this.globalRemaining = data.globalRemaining;
      this.globalResetsAt = data.globalResetsAt || (Math.floor(Date.now() / 86400000) + 1) * 86400000;
      this.resetsAt = data.resetsAt || this.globalResetsAt; this.timeZone = data.timeZone || 'UTC';
      clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => { if (this.isConnected && (this.dataset.mode === 'page' || this.panelOpen)) void this.load(); }, Math.max(1000, Math.min(this.resetsAt, this.globalResetsAt) - Date.now() + 1000));
      if (data.turnstileSiteKey && this.enabled) void this.configureChallenge(data.turnstileSiteKey);
      if (!this.threads.some(t => t.id === this.active)) this.setActive('');
      this.renderThreads();
      if (refreshMessages) { if (this.active) await this.loadMessages(); else { this.messages = []; this.turns = 0; this.renderMessages(); } }
      this.notice(this.enabled ? '' : this.t('The guide is currently offline. Your saved conversations are still available.', 'Ο βοηθός δεν είναι διαθέσιμος αυτή τη στιγμή. Μπορείτε να δείτε τις αποθηκευμένες συνομιλίες σας.'));
    } catch (error) { this.notice(this.errorText(error)); }
    this.scheduleTitles(); this.updateControls();
    if (this.enabled && !this.active && !this.busy && !this.input.value && !this.attached.length && (this.dataset.mode === 'page' || this.panelOpen)) {
      try { if (!localStorage.getItem('site-chat-tour-v1')) this.openTour(); } catch {}
    }
  }
  private errorText(error: unknown) {
    if (error instanceof ChatRequestError) return error.message;
    if (error instanceof Error && error.name === 'TimeoutError') return this.t('The request took too long. Please try again.', 'Η απάντηση καθυστέρησε. Δοκιμάστε ξανά.');
    return this.t(error instanceof Error ? error.message : 'Something went wrong. Please try again.', 'Κάτι δεν πήγε καλά. Δοκιμάστε ξανά.');
  }
  private setActive(id: string) { this.active = id; this.loadingThread = ''; this.threadLoadFailed = false; this.viewVersion++; this.detailRequest++; if (hasChatConsent()) try { sessionStorage.setItem('site-chat-active', id); } catch {} }
  private async loadMessages(forceScroll = true) {
    clearTimeout(this.pollTimer);
    const selected = this.active, version = this.viewVersion, request = ++this.detailRequest;
    const run = this.running.get(selected);
    if (run) {
      this.messages = run.messages; this.turns = run.turns; this.persona = run.persona; this.progress = run.progress;
      this.renderPersona(); this.renderMessages(forceScroll); return;
    }
    if (this.unconfirmedThreads.has(selected)) {
      this.messages = []; this.turns = 0; this.renderMessages(forceScroll); return;
    }
    this.loadingThread = selected; this.threadLoadFailed = false;
    if (!this.messages.length) this.renderMessages(false);
    this.updateControls();
    let data: ChatData;
    try { data = await this.api(undefined, selected); }
    catch (error) {
      if (this.active === selected && this.viewVersion === version && request === this.detailRequest) {
        this.loadingThread = ''; this.threadLoadFailed = true; this.renderMessages(false);
      }
      throw error;
    }
    if (this.active !== selected || this.viewVersion !== version || request !== this.detailRequest || this.running.has(selected) || !hasChatConsent()) return;
    this.loadingThread = ''; this.threadLoadFailed = false;
    this.messages = data.messages; this.turns = data.thread.questions;
    if (!this.personaSaving) { this.persona = data.thread.persona || 'baseline'; this.renderPersona(); }
    this.renderMessages(forceScroll);
    if (this.messages.some(m => m.status === 'pending')) {
      this.pollTimer = setTimeout(() => { if (this.isConnected) void this.load().catch(() => {}); }, 4000);
    }
  }
  private node(tag: string, className: string, value?: string) {
    const node = document.createElement(tag); node.className = className;
    if (value) node.textContent = value; return node;
  }
  private add(parent: Node, ...children: Node[]) { for (const child of children) parent.appendChild(child); }
  private renderPersona() {
    const selected = PERSONAS.find(item => item.id === this.persona)!;
    const name = selected.name[this.el ? 'el' : 'en'];
    this.q('.chat-persona-current').textContent = name;
    this.q('.chat-persona-picker summary').setAttribute('aria-label', this.t(`Answer style: ${name}`, `Ύφος απάντησης: ${name}`));
    for (const input of this.querySelectorAll<HTMLInputElement>('.chat-persona-options input')) input.checked = input.value === this.persona;
  }
  private async choosePersona(persona: Persona) {
    if (!hasChatConsent() || this.busy || this.loadingConversation || this.threadLoadFailed || this.answering || this.messages.some(m => m.status === 'pending') || this.personaSaving) { this.renderPersona(); return; }
    const previous = this.persona, selected = this.active;
    this.persona = persona; this.personaSaving = true; this.renderPersona(); this.updateControls(); this.closeMenus();
    this.q<HTMLElement>('.chat-persona-picker summary').focus();
    try {
      if (selected) await this.api({ action: 'persona', id: selected, persona });
      if (!hasChatConsent()) { this.applyConsent(); return; }
      try { sessionStorage.setItem('site-chat-persona', persona); } catch {}
      this.threads = this.threads.map(thread => thread.id === selected ? { ...thread, persona } : thread);
    } catch (error) { this.persona = hasChatConsent() ? previous : 'baseline'; this.renderPersona(); this.notice(this.errorText(error)); }
    finally { this.personaSaving = false; this.updateControls(); }
  }
  private renderThreads() {
    const list = this.q('.chat-thread-list'), scroll = list.scrollTop;
    const previous = new Map(Array.from(list.children).map(row => [(row as HTMLElement).dataset.threadId, row as HTMLElement]));
    const rows: HTMLElement[] = [];
    const visible = this.threads.filter(t => !!t.archived === this.archived);
    if (!visible.length) rows.push(this.node('p', 'chat-empty-list', this.t('No conversations here yet.', 'Δεν έχετε ακόμη συνομιλίες εδώ.')));
    for (const thread of visible) {
      if (thread.id === this.editingId) {
        const state = JSON.stringify(['rename', this.renameSaving, this.renameError]);
        const old = previous.get(thread.id);
        const form = old?.dataset.renderState === state ? old : this.renderRename(thread);
        form.dataset.threadId = thread.id; form.dataset.renderState = state; rows.push(form); continue;
      }
      const state = JSON.stringify([thread.id === this.active, !!thread.archived, this.running.has(thread.id)]);
      const existing = previous.get(thread.id);
      if (existing?.dataset.renderState === state) {
        const select = existing.querySelector<HTMLButtonElement>('.chat-select')!;
        const title = thread.title === 'New conversation' ? this.t('New chat', 'Νέα συνομιλία') : thread.title;
        if (select.textContent !== title) select.textContent = title;
        select.title = title; rows.push(existing); continue;
      }
      const row = this.node('div', `chat-thread${thread.id === this.active ? ' is-selected' : ''}`); row.dataset.threadId = thread.id; row.dataset.renderState = state;
      const select = this.node('button', 'chat-select', thread.title === 'New conversation' ? this.t('New chat', 'Νέα συνομιλία') : thread.title) as HTMLButtonElement;
      select.dataset.action = 'select'; select.dataset.id = thread.id; select.title = select.textContent || thread.title;
      if (thread.id === this.active) select.setAttribute('aria-current', 'true');
      this.add(row, select);
      if (this.running.has(thread.id)) {
        const status = this.node('span', 'chat-thread-running');
        status.setAttribute('role', 'img'); status.setAttribute('aria-label', this.t('Answering', 'Η απάντηση ετοιμάζεται'));
        status.title = this.t('Answering', 'Η απάντηση ετοιμάζεται'); this.add(row, status);
      }
      const menu = this.node('details', 'chat-thread-menu');
      const summary = this.node('summary', '', '···'); summary.setAttribute('aria-label', this.t('Conversation actions', 'Επιλογές συνομιλίας')); this.add(menu, summary);
      const options = this.node('div', 'chat-menu-options');
      for (const [action, label] of [['rename', this.t('Rename', 'Μετονομασία')], ['archive', thread.archived ? this.t('Restore', 'Επαναφορά') : this.t('Archive', 'Αρχειοθέτηση')], ['delete', this.t('Delete', 'Διαγραφή')]]) {
        const button = this.node('button', '', '') as HTMLButtonElement; button.disabled = this.running.has(thread.id);
        this.add(button, this.icon(action === 'archive' && thread.archived ? 'restore' : action), this.node('span', '', label));
        button.setAttribute('aria-label', label); button.dataset.action = action; button.dataset.id = thread.id; this.add(options, button);
      }
      this.add(menu, options); this.add(row, menu); rows.push(row);
    }
    for (const child of Array.from(list.children)) if (!rows.includes(child as HTMLElement)) child.remove();
    rows.forEach((row, index) => { if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null); });
    list.scrollTop = scroll;
    this.q('[data-action="active"]').setAttribute('aria-pressed', String(!this.archived));
    this.q('[data-action="archived"]').setAttribute('aria-pressed', String(this.archived));
  }
  private renderMessages(forceScroll = true) {
    const area = this.q('.chat-messages');
    const scroll = area.scrollTop, follow = forceScroll || area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    area.replaceChildren();
    if (!this.messages.length && (this.loadingConversation || this.threadLoadFailed)) {
      const loading = this.node('div', 'chat-thread-loading');
      loading.setAttribute('role', this.threadLoadFailed ? 'alert' : 'status');
      this.add(loading, this.node('span', '', this.threadLoadFailed
        ? this.t('Could not load this chat. Select it again to retry.', 'Δεν φορτώθηκε η συνομιλία. Επιλέξτε την ξανά για να δοκιμάσετε πάλι.')
        : this.t('Loading conversation…', 'Φόρτωση συνομιλίας…')));
      if (!this.threadLoadFailed) for (let i = 0; i < 3; i++) {
        const line = this.node('div', 'chat-loading-line'); line.setAttribute('aria-hidden', 'true'); this.add(loading, line);
      }
      this.add(area, loading);
    } else if (!this.messages.length) {
      const intro = this.node('div', 'chat-welcome');
      this.add(intro, this.node('span', 'chat-eyebrow', this.t('THE PERSON BEHIND THE WORK', 'Ο ΑΝΘΡΩΠΟΣ ΠΙΣΩ ΑΠΟ ΤΗ ΔΟΥΛΕΙΑ')),
        this.node('h2', '', this.t('What are you curious about?', 'Τι θα θέλατε να μάθετε;')),
        this.node('p', '', this.t('Explore my work, research, and the things I write about. This AI guide finds answers in the pages of this site.', 'Μάθετε περισσότερα για τη δουλειά, την έρευνα και τα άρθρα μου. Ο βοηθός απαντά με βάση το περιεχόμενο του ιστοτόπου.')));
      const suggestions = this.node('div', 'chat-suggestions');
      const prompts = CHAT_STARTERS[this.el?'el':'en'];
      for (const prompt of prompts) {
        const button = this.node('button', '', prompt + ' ↗'); button.dataset.action = 'suggest'; button.dataset.id = prompt; this.add(suggestions, button);
      }
      this.add(intro, suggestions); this.add(area, intro);
    }
    for (const message of this.messages) {
      const question = this.node('div', 'chat-message chat-user'); this.add(question, this.node('span', 'chat-speaker', this.t('You', 'Εσείς')), this.node('p', '', message.question));
      if (message.context_sources?.length) {
        const context = this.node('div', 'chat-question-sources');
        for (const source of message.context_sources) {
          if (!isIndexedSource(source.url)) continue;
          const link = this.node('a', 'chat-source-chip', source.title) as HTMLAnchorElement; link.href = source.url; link.title = source.title; this.add(context, link);
        }
        this.add(question, context);
      }
      const answer = this.node('div', 'chat-message chat-assistant'); answer.dataset.messageId = message.id;
      const author = this.node('div', 'chat-assistant-author');
      const avatar = document.createElement('img');
      avatar.src = '/media/avatar-small.webp'; avatar.alt = ''; avatar.width = 28; avatar.height = 28;
      avatar.className = 'chat-assistant-avatar'; avatar.loading = 'lazy'; avatar.decoding = 'async';
      this.add(author, avatar, this.node('span', 'chat-speaker', this.t('Site guide · AI', 'Βοηθός AI')));
      this.add(answer, author);
      if (message.persona && message.persona !== 'baseline') {
        const style = PERSONAS.find(item => item.id === message.persona);
        if (style) this.add(author, this.node('span', 'chat-answer-style', style.name[this.el ? 'el' : 'en']));
      }
      if (message.status === 'pending' && !message.answer) {
        const progress = this.node('div', 'chat-thinking'); progress.setAttribute('role', 'status');
        progress.setAttribute('aria-label', this.t('Preparing an answer', 'Ετοιμάζω την απάντηση'));
        const label = this.node('span', 'chat-thinking-label', this.thinkingLabel()); label.setAttribute('aria-hidden', 'true');
        this.add(progress, label);
        const dots = this.node('span', 'chat-thinking-dots'); dots.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 3; i++) this.add(dots, this.node('span', ''));
        this.add(progress, dots); this.add(answer, progress);
      } else {
        const content = this.node('div', 'chat-answer-content');
        const body = (message.status === 'failed' && message.answer ? chatText(message.answer, this.el ? 'el' : 'en') : message.answer) || '';
        if (message.status === 'failed') content.textContent = body;
        else renderChatMarkdown(content, body);
        this.add(answer, content);
      }
      if (message.sources.length) {
        const sources = this.node('div', 'chat-sources'); this.add(sources, this.node('span', '', this.t('On this site', 'Πηγές στον ιστότοπο')));
        for (const source of uniqueCitations(message.sources, this.el ? 'el' : 'en')) {
          // Render plain labels and validated citation destinations. External
          // presentation viewers pass through the normal leave-site confirmation.
          const href = chatCitationHref(source);
          if (!href) continue;
          const link = this.node('a', '', source.title + ' ↗') as HTMLAnchorElement;
          link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          this.add(sources, link);
        }
        this.add(answer, sources);
      }
      if (message.status === 'done' && message.model) {
        const model = modelLabel(message.model);
        const meta = this.node('div', 'chat-answer-meta');
        const badge = this.node('span', 'chat-model', model.name);
        badge.title = model.id;
        badge.setAttribute('aria-label', this.t(`Answered with ${model.name}`, `Απάντηση από το ${model.name}`));
        this.add(meta, this.node('span', '', this.t('Answered with', 'Απάντηση από')), badge);
        this.add(answer, meta);
      }
      if (message.status === 'done' && message.answer?.trim()) this.add(answer, this.copyControl(message));
      this.add(area, question, answer);
    }
    this.syncThinking();
    area.scrollTo({ top: follow ? area.scrollHeight : scroll, behavior: 'instant' });
    this.updateControls();
  }
  private updateControls() {
    const thread = this.threads.find(t => t.id === this.active);
    const pending = this.answering || this.messages.some(m => m.status === 'pending');
    const locked = !hasChatConsent() || this.busy || this.loadingConversation || this.threadLoadFailed || this.personaSaving || pending || !this.enabled || this.turns >= 4 || !!thread?.archived || this.remaining <= 0 || this.globalRemaining <= 0;
    this.q<HTMLFieldSetElement>('.chat-persona-options').disabled = !hasChatConsent() || this.busy || this.loadingConversation || this.threadLoadFailed || this.personaSaving || pending || !!thread?.archived;
    this.input.disabled = locked;
    this.q<HTMLButtonElement>('.chat-compose button[type="submit"]').disabled = locked || !this.input.value.trim() || (!!this.challengeKey && !this.challengeToken);
    this.q<HTMLButtonElement>('[data-action="mention"]').disabled = locked;
    this.querySelectorAll<HTMLButtonElement>('[data-remove-source]').forEach(button => { button.disabled = locked; });
    this.q<HTMLButtonElement>('[data-action="clear"]').disabled = this.busy || this.running.size > 0;
    const sessionRemaining = this.q('.chat-session-remaining');
    const left = Math.max(0, 4 - this.turns);
    sessionRemaining.hidden = this.turns === 0;
    sessionRemaining.textContent = left === 0 ? this.t('This conversation is complete', 'Η συνομιλία ολοκληρώθηκε') : this.t(`${left} ${left === 1 ? 'question' : 'questions'} left in this chat`, `${left === 1 ? 'Απομένει 1 ερώτηση' : `Απομένουν ${left} ερωτήσεις`} σε αυτή τη συνομιλία`);
    this.q('.chat-quota').textContent = this.t(`${this.remaining} questions left today · resets at local midnight`, `${this.remaining} ${this.remaining === 1 ? 'ερώτηση' : 'ερωτήσεις'} ακόμη σήμερα · ανανέωση τα μεσάνυχτα`);
    this.q('.chat-quota').title = this.resetsAt ? new Intl.DateTimeFormat(this.el ? 'el-GR' : 'en-GB', { timeZone: this.timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(this.resetsAt) + ` (${this.timeZone})` : '';
    const completed = this.turns >= LIMITS.thread && !this.busy && !pending;
    this.q('.chat-continue').hidden = !completed;
    this.q('.chat-compose').hidden = completed;
    const noDailyAllowance = this.remaining <= 0 || this.globalRemaining <= 0;
    this.q<HTMLButtonElement>('.chat-continue [data-action="new"]').disabled = !this.enabled || noDailyAllowance;
    this.q('.chat-continue-description').textContent = noDailyAllowance
      ? this.t('You can start another chat when your daily allowance resets, or get in touch with Georgios.', 'Μπορείτε να ξεκινήσετε νέα συνομιλία όταν ανανεωθεί το ημερήσιο όριό σας ή να επικοινωνήσετε με τον Γιώργο.')
      : this.t('This chat is complete. Start a fresh one, or take the conversation to Georgios.', 'Αυτή η συνομιλία ολοκληρώθηκε. Συνεχίστε με μια νέα ή μιλήστε απευθείας με τον Γιώργο.');
    this.q('.chat-messages').setAttribute('aria-busy', String(this.busy || pending || this.loadingConversation));
    if (thread?.archived) this.notice(this.t('This conversation is archived. Restore it from the history menu to continue.', 'Αυτή η συνομιλία βρίσκεται στο αρχείο. Επαναφέρετέ την από το μενού της για να συνεχίσετε.'));
    else if (this.enabled && this.globalRemaining <= 0) this.notice(this.t('All 200 shared questions have been used today. Please return after the shared budget resets at 00:00 UTC.', 'Εξαντλήθηκε το ημερήσιο όριο των 200 ερωτήσεων για τον ιστότοπο. Μπορείτε να ρωτήσετε ξανά μετά τις 00:00 UTC.'));
    else if (this.enabled && this.remaining <= 0) this.notice(this.t('You’ve reached your daily limit of 10 questions. Your allowance resets at local midnight.', 'Φτάσατε τις 10 ερωτήσεις για σήμερα. Μπορείτε να ρωτήσετε ξανά μετά τα μεσάνυχτα.'));
  }
  private async action(action: string, id?: string) {
    if (action === 'download-zip' && id) { await this.downloadReplyZip(id); return; }
    if ((action === 'copy-markdown' || action === 'copy-plain') && id) { await this.copyReply(id, action === 'copy-plain'); return; }
    if (action === 'cookie-settings') { window.dispatchEvent(new Event('site-cookie-settings')); return; }
    if (action === 'minimize') { await this.togglePanel(false); return; }
    if (action === 'history') {
      const hidden = this.classList.toggle('chat-hide-history');
      this.q('[data-action="history"]').setAttribute('aria-expanded', String(!hidden)); return;
    }
    if (!this.applyConsent() || this.busy || this.renameSaving || this.personaSaving) return;
    if (action === 'mention') { this.openMention(); return; }
    if (action === 'tour') { this.openTour(); return; }
    this.notice('');
    if (action === 'cancel-rename') { this.cancelRename(); return; }
    if (action === 'suggest') { this.input.value = id || ''; this.input.dispatchEvent(new Event('input')); this.input.focus(); return; }
    if (action === 'active' || action === 'archived') { this.editingId = ''; this.archived = action === 'archived'; this.renderThreads(); return; }
    if (action === 'new') {
      this.saveDraft(); this.drafts.delete(''); this.input.value = '';
      this.attached = []; this.renderAttachments(); this.closeSources();
      clearTimeout(this.pollTimer); this.setActive(''); this.turns = 0; this.messages = []; this.editingId = ''; this.archived = false; this.renderThreads(); this.renderMessages(); this.input.value = ''; this.input.dispatchEvent(new Event('input')); this.input.focus(); return;
    }
    try {
      if (action === 'select' && id) {
        if (id === this.active && !this.threadLoadFailed) return;
        this.saveDraft(); this.closeSources(); this.setActive(id); this.editingId = '';
        const draft = this.drafts.get(id); this.input.value = draft?.text || ''; this.attached = draft?.attached || [];
        this.messages = []; this.turns = this.threads.find(thread => thread.id === id)?.questions || 0;
        const run = this.running.get(id);
        if (run) { this.messages = run.messages; this.turns = run.turns; this.persona = run.persona; this.progress = run.progress; this.renderPersona(); }
        else if (!this.unconfirmedThreads.has(id)) this.loadingThread = id;
        this.renderAttachments(); this.renderMessages(); this.renderThreads(); this.input.dispatchEvent(new Event('input'));
        await this.loadMessages(); return;
      }
      if ((id && this.running.has(id)) || (action === 'clear' && this.running.size)) return;
      if (action === 'rename' && id) {
        const thread = this.threads.find(t => t.id === id);
        if (!thread) return;
        this.editingId = id; this.renameDraft = thread.title === 'New conversation' ? this.t('New chat', 'Νέα συνομιλία') : thread.title; this.renameError = '';
        this.renderThreads();
        const input = this.q<HTMLInputElement>('.chat-thread-rename input'); input.focus(); input.select(); return;
      }
      if (action === 'delete' || action === 'clear' || action === 'archive') {
        const restoring = action === 'archive' && !!this.threads.find(t => t.id === id)?.archived;
        if (!restoring && !await this.confirmAction(action, id)) return;
        this.busy = true; this.updateControls();
        try {
          await this.api(action === 'archive' ? { action, id, archived: !restoring } : { action, id });
          if (action === 'clear' || (action === 'delete' && id === this.active)) this.setActive('');
        } finally { this.busy = false; this.updateControls(); }
      }
      await this.load();
    } catch (error) { this.notice(this.errorText(error)); }
  }
  private copyControl(message: ChatMessage) {
    const actions = this.node('div', 'chat-reply-actions');
    const menu = this.node('details', 'chat-copy-menu') as HTMLDetailsElement; menu.dataset.copyId = message.id;
    const trigger = this.node('summary', 'chat-response-control'); trigger.dataset.tooltip = this.t('Copy response', 'Αντιγραφή απάντησης'); trigger.setAttribute('aria-label', trigger.dataset.tooltip);
    this.add(trigger, this.icon('copy')); this.add(menu, trigger);
    const options = this.node('div', 'chat-copy-options'); options.setAttribute('role', 'group'); options.setAttribute('aria-label', this.t('Copy format', 'Μορφή αντιγραφής'));
    for (const plain of [false, true]) {
      const button = this.node('button', '') as HTMLButtonElement; button.type = 'button'; button.dataset.action = plain ? 'copy-plain' : 'copy-markdown'; button.dataset.id = message.id;
      this.add(button, this.icon(plain ? 'text' : 'markdown'));
      const label = this.node('span', '');
      this.add(label, this.node('strong', '', plain ? this.t('Plain text', 'Απλό κείμενο') : this.t('As written', 'Όπως γράφτηκε')),
        this.node('small', '', plain ? this.t('Without Markdown formatting', 'Χωρίς σύμβολα μορφοποίησης') : this.t('Keep Markdown formatting', 'Με τη μορφοποίηση Markdown')));
      this.add(button, label); this.add(options, button);
    }
    this.add(menu, options);
    menu.addEventListener('toggle', () => { if (menu.open) { this.closeMenus(menu); this.fitReplyMenu(menu); } });
    const feedback = this.node('span', 'chat-copy-feedback'); feedback.setAttribute('role', 'status');
    this.add(actions, menu, this.downloadControl(message), feedback); return actions;
  }
  private downloadControl(message: ChatMessage) {
    const files = replyFiles(message.sources);
    if (!files.length) {
      const wrapper = this.node('span', 'chat-download-disabled chat-response-control'); wrapper.tabIndex = 0; wrapper.dataset.tooltip = this.t('No files in this response', 'Δεν υπάρχουν αρχεία σε αυτή την απάντηση');
      const button = this.node('button', '') as HTMLButtonElement; button.type = 'button'; button.disabled = true; button.setAttribute('aria-label', this.t('Download files', 'Λήψη αρχείων')); this.add(button, this.icon('download')); this.add(wrapper, button); return wrapper;
    }
    const menu = this.node('details', 'chat-download-menu') as HTMLDetailsElement; menu.dataset.downloadId = message.id;
    const trigger = this.node('summary', 'chat-response-control'); trigger.dataset.tooltip = this.t('Download files', 'Λήψη αρχείων'); trigger.setAttribute('aria-label', trigger.dataset.tooltip); this.add(trigger, this.icon('download'));
    const options = this.node('div', 'chat-copy-options chat-download-options'); options.setAttribute('role', 'group'); options.setAttribute('aria-label', this.t('Files in this response', 'Αρχεία αυτής της απάντησης'));
    for (const file of files) {
      const link = this.node('a', '') as HTMLAnchorElement; link.href = file.url; link.download = file.filename; link.title = file.title;
      const label = this.node('span', ''); this.add(label, this.node('strong', '', file.title), this.node('small', '', file.filename)); this.add(link, this.icon('file'), label); this.add(options, link);
      link.addEventListener('click', () => { menu.open = false; trigger.focus(); });
    }
    const zip = this.node('button', 'chat-download-zip') as HTMLButtonElement; zip.type = 'button'; zip.dataset.action = 'download-zip'; zip.dataset.id = message.id; zip.disabled = files.length < 2 || this.downloads.has(message.id);
    zip.title = files.length < 2 ? this.t('ZIP needs at least two files', 'Το ZIP χρειάζεται τουλάχιστον δύο αρχεία') : this.t('Download all files as ZIP', 'Λήψη όλων των αρχείων σε ZIP');
    this.add(zip, this.icon('archive'), this.node('span', '', this.t('Download as ZIP', 'Λήψη σε ZIP'))); this.add(options, zip); this.add(menu, trigger, options);
    menu.addEventListener('toggle', () => { if (menu.open) { this.closeMenus(menu); this.fitReplyMenu(menu); } }); return menu;
  }
  private fitReplyMenu(menu: HTMLDetailsElement) {
    const options = menu.querySelector<HTMLElement>('.chat-copy-options')!;
    const area = this.q('.chat-messages').getBoundingClientRect(), trigger = menu.querySelector('summary')!.getBoundingClientRect();
    const above = Math.max(0, trigger.top - area.top - 8), below = Math.max(0, area.bottom - trigger.bottom - 8);
    const upward = above >= Math.min(290, options.scrollHeight) || above >= below;
    options.style.bottom = upward ? 'calc(100% + 6px)' : 'auto'; options.style.top = upward ? 'auto' : 'calc(100% + 6px)';
    options.style.maxHeight = `${Math.max(35, Math.min(290, upward ? above : below))}px`;
    options.style.maxWidth = `${Math.max(140, area.right - trigger.left - 10)}px`;
  }
  private async downloadReplyZip(id: string) {
    if (!hasChatConsent() || this.downloads.has(id)) return;
    const message = this.messages.find(message => message.id === id && message.status === 'done');
    if (!message || replyFiles(message.sources).length < 2) return;
    const menu = this.querySelector<HTMLDetailsElement>(`.chat-download-menu[data-download-id="${id}"]`);
    if (!menu) return;
    const feedback = menu.parentElement!.querySelector<HTMLElement>('.chat-copy-feedback')!;
    const controller = new AbortController(); this.downloads.set(id, controller);
    const timeout = setTimeout(() => controller.abort(), 60000);
    const zipButton = menu.querySelector<HTMLButtonElement>('.chat-download-zip')!; zipButton.disabled = true;
    clearTimeout(this.copyTimer); feedback.textContent = this.t('Preparing ZIP…', 'Ετοιμάζεται το ZIP…');
    try {
      const bytes = await replyZip(message.sources, controller.signal);
      if (!hasChatConsent() || !this.isConnected) return;
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }));
      const link = document.createElement('a'); link.href = url; link.download = 'georgios-chat-files.zip'; link.hidden = true; this.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      feedback.textContent = this.t('ZIP ready', 'Το ZIP είναι έτοιμο');
    } catch (error) {
      if (!controller.signal.aborted) console.warn('chat_download_failure', { kind: error instanceof Error ? error.name : 'unknown', reason: error instanceof Error && ['Multiple files required', 'Download unavailable', 'Download too large', 'Invalid document'].includes(error.message) ? error.message : 'Archive preparation failed' });
      if (!controller.signal.aborted) feedback.textContent = this.t('Download failed. Please try again.', 'Η λήψη δεν έγινε. Δοκιμάστε ξανά.'); else feedback.textContent = ''; }
    finally {
      clearTimeout(timeout); this.downloads.delete(id); zipButton.disabled = false; menu.querySelector('summary')?.focus();
      this.copyTimer = setTimeout(() => { feedback.textContent = ''; }, 4000);
    }
  }
  private async copyReply(id: string, plain: boolean) {
    if (!hasChatConsent()) return;
    const message = this.messages.find(message => message.id === id && message.status === 'done');
    if (!message?.answer) return;
    const menu = this.querySelector<HTMLDetailsElement>(`.chat-copy-menu[data-copy-id="${id}"]`);
    if (!menu) return;
    const feedback = menu.parentElement!.querySelector<HTMLElement>('.chat-copy-feedback')!;
    clearTimeout(this.copyTimer); this.querySelectorAll('.chat-copy-feedback').forEach(label => { label.textContent = ''; });
    try {
      await navigator.clipboard.writeText(plain ? chatPlainText(message.answer) : message.answer);
      feedback.textContent = this.t('Copied', 'Αντιγράφηκε');
    } catch { feedback.textContent = this.t('Could not copy. Select and copy the answer.', 'Δεν έγινε η αντιγραφή. Επιλέξτε το κείμενο και αντιγράψτε το.'); }
    menu.open = false; menu.querySelector('summary')?.focus();
    this.copyTimer = setTimeout(() => { feedback.textContent = ''; }, 3500);
  }
  private icon(action: string) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    const paths: Record<string, string[]> = {
      copy: ['M9 8h11v13H9zM5 16H3V3h11v2'],
      external: ['M14 3h7v7M21 3 10 14M10 3H3v18h18v-7'],
      download: ['M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6'],
      text: ['M4 5h16M12 5v14M8 19h8'],
      markdown: ['M3 5h18v14H3zM6 15V9l3 3 3-3v6M16 9v6m-2-2 2 2 2-2'],
      page: ['M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7'],
      file: ['M9 7v9a3 3 0 0 0 6 0V6a4 4 0 0 0-8 0v11a5 5 0 0 0 10 0V8'],
      persona: ['M4 7h16M4 17h16M9 4v6M15 14v6'],
      history: ['M4 8a8 8 0 1 1-1 7M4 3v5h5M12 8v5l3 2'],
      rename: ['m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z'],
      archive: ['M3 4h18v4H3zM5 8v12h14V8M10 12h4'],
      restore: ['M4 8a8 8 0 1 1-1 7M4 3v5h5'],
      save: ['m5 12 4 4L19 6'],
      cancel: ['m6 6 12 12M18 6 6 18'],
      delete: ['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'],
    };
    for (const d of paths[action] || paths.delete) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.appendChild(path);
    }
    return svg;
  }
  private async confirmAction(action: string, id?: string): Promise<boolean> {
    const destructive = action !== 'archive';
    const title = action === 'clear' ? this.t('Delete all conversations?', 'Διαγραφή όλων των συνομιλιών;')
      : action === 'delete' ? this.t('Delete conversation?', 'Διαγραφή συνομιλίας;') : this.t('Archive conversation?', 'Αρχειοθέτηση συνομιλίας;');
    const storedName = this.threads.find(t => t.id === id)?.title || '';
    const name = storedName === 'New conversation' ? this.t('New chat', 'Νέα συνομιλία') : storedName;
    const description = action === 'clear' ? this.t('All your conversations will be permanently deleted. This cannot be undone.', 'Όλες οι συνομιλίες σας θα διαγραφούν οριστικά. Δεν θα μπορείτε να τις επαναφέρετε.')
      : action === 'delete' ? this.t(`“${name}” and its messages will be permanently deleted. This cannot be undone.`, `Η συνομιλία «${name}» και τα μηνύματά της θα διαγραφούν οριστικά. Δεν θα μπορείτε να τα επαναφέρετε.`)
      : this.t(`“${name}” will move to Archived. You can restore it at any time.`, `Η συνομιλία «${name}» θα μπει στο αρχείο. Μπορείτε να την επαναφέρετε όποτε θέλετε.`);
    const acceptLabel = action === 'clear' ? this.t('Delete all', 'Διαγραφή όλων') : destructive ? this.t('Delete', 'Διαγραφή') : this.t('Archive', 'Αρχειοθέτηση');
    return this.confirmDialog(title, description, destructive ? 'delete' : 'archive', acceptLabel, destructive);
  }
  private async followChatLink(event: MouseEvent | KeyboardEvent) {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href],a[data-chat-href]');
    if (!link || link.hasAttribute('data-confirm-link') || link.hasAttribute('data-confirm-download')) return;
    const href = safeChatLink(link.dataset.chatHref || link.getAttribute('href') || '');
    if (!href) { event.preventDefault(); return; }
    const destination = externalChatDestination(href);
    if (!destination) return;
    event.preventDefault(); event.stopPropagation();
    const newTab = ('button' in event && event.button === 1) || event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank';
    const current = externalChatDestination(location.origin) ? 'mpalaourg.dev' : location.hostname;
    const presentation = officePresentationFile(href);
    if (presentation) {
      await this.confirmDialog(
        this.t('Open presentation in Microsoft’s viewer?', 'Άνοιγμα παρουσίασης στο πρόγραμμα προβολής της Microsoft;'),
        this.t(`Microsoft’s viewer opens in a new tab, outside ${current}. You can also download the original PowerPoint file.`, `Η προβολή της Microsoft ανοίγει σε νέα καρτέλα, εκτός του ${current}. Μπορείτε επίσης να κατεβάσετε το αρχικό αρχείο PowerPoint.`),
        'external', this.t('Open presentation', 'Άνοιγμα παρουσίασης'), false, href, true, presentation,
      );
      return;
    }
    await this.confirmDialog(
      this.t(`Leave ${current}?`, `Θέλετε να φύγετε από το ${current};`),
      this.t(`This link takes you to ${destination}, outside this website. Continue if you want to visit it.`, `Ο σύνδεσμος οδηγεί στο ${destination}, εκτός αυτού του ιστοτόπου. Επιλέξτε «Συνέχεια» για να τον επισκεφθείτε.`),
      'external', this.t('Continue', 'Συνέχεια'), false, href, newTab,
    );
  }
  private async confirmDialog(title: string, description: string, icon: string, acceptLabel: string, destructive: boolean, destination?: string, newTab = false, downloadFile?: string): Promise<boolean> {
    const dialog = this.q<HTMLDialogElement>('.chat-confirm');
    if (dialog.open) return false;
    const focused = document.activeElement as HTMLElement | null;
    const returnFocus = focused?.closest('.chat-thread-menu')?.querySelector<HTMLElement>('summary') || focused;
    this.q('.chat-confirm-title').textContent = title;
    this.q('.chat-confirm-description').textContent = description;
    this.q('.chat-confirm-icon').replaceChildren(this.icon(icon));
    dialog.classList.toggle('is-presentation', !!downloadFile);
    const address = this.q('.chat-confirm-url'); address.textContent = downloadFile?.split('/').pop() || destination || ''; address.hidden = !destination;
    const download = this.q<HTMLAnchorElement>('[data-confirm-download]');
    download.hidden = !downloadFile;
    download.textContent = this.t('Download file', 'Λήψη αρχείου');
    if (downloadFile) { download.href = downloadFile; download.download = downloadFile.split('/').pop()!; }
    else { download.removeAttribute('href'); download.removeAttribute('download'); }
    this.q('[data-confirm="cancel"]').textContent = destination ? this.t('Stay here', 'Παραμονή εδώ') : this.t('Cancel', 'Ακύρωση');
    dialog.classList.toggle('is-destructive', destructive);
    const button = this.q<HTMLButtonElement>('[data-confirm="accept"]');
    const outbound = this.q<HTMLAnchorElement>('[data-confirm-link]');
    button.hidden = !!destination; outbound.hidden = !destination;
    if (destination) { outbound.href = destination; outbound.target = newTab ? '_blank' : '_self'; }
    else outbound.removeAttribute('href');
    // A native acknowledgement link preserves normal browser navigation and
    // new-tab gestures without depending on script-created popup windows.
    const accept = destination ? outbound : button;
    accept.textContent = acceptLabel;
    this.querySelectorAll<HTMLDetailsElement>('.chat-thread-menu[open]').forEach(menu => { menu.open = false; });
    return new Promise(resolve => {
      const onClose = () => {
        this.q('[data-confirm="cancel"]').removeEventListener('click', cancel);
        accept.removeEventListener('click', confirm);
        download.removeEventListener('click', downloaded);
        returnFocus?.focus();
        resolve(dialog.returnValue === 'confirm');
      };
      const cancel = () => dialog.close('cancel');
      const confirm = () => { dialog.close('confirm'); };
      const downloaded = () => dialog.close('download');
      download.addEventListener('click', downloaded);
      this.q('[data-confirm="cancel"]').addEventListener('click', cancel);
      accept.addEventListener('click', confirm);
      dialog.addEventListener('close', onClose, { once: true });
      dialog.returnValue = '';
      dialog.showModal();
    });
  }
  private renderRename(thread: Thread) {
    const form = this.node('form', 'chat-thread-rename') as HTMLFormElement;
    form.setAttribute('aria-label', this.t('Rename conversation', 'Μετονομασία συνομιλίας'));
    const input = document.createElement('input'); input.name = 'title'; input.value = this.renameDraft;
    input.maxLength = 80; input.required = true; input.disabled = this.renameSaving;
    input.setAttribute('aria-label', this.t('Conversation title', 'Τίτλος συνομιλίας'));
    input.addEventListener('input', () => { this.renameDraft = input.value; });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !this.renameSaving) { event.preventDefault(); event.stopPropagation(); this.cancelRename(); }
    });
    const controls = this.node('div', 'chat-rename-controls');
    for (const action of ['save', 'cancel']) {
      const label = action === 'save' ? this.t('Save title', 'Αποθήκευση τίτλου') : this.t('Cancel rename', 'Ακύρωση μετονομασίας');
      const button = this.node('button', '', '') as HTMLButtonElement;
      button.type = action === 'save' ? 'submit' : 'button'; button.disabled = this.renameSaving;
      button.setAttribute('aria-label', label); button.title = label;
      if (action === 'cancel') button.dataset.action = 'cancel-rename';
      this.add(button, this.icon(action)); this.add(controls, button);
    }
    this.add(form, input, controls);
    if (this.renameError) { const error = this.node('p', 'chat-rename-error', this.renameError); error.setAttribute('role', 'alert'); this.add(form, error); }
    form.dataset.id = thread.id;
    return form;
  }
  private cancelRename() {
    const id = this.editingId; this.editingId = ''; this.renameError = '';
    this.renderThreads(); this.querySelector<HTMLElement>(`.chat-select[data-id="${id}"]`)?.focus();
  }
  private async rename() {
    if (!hasChatConsent() || !this.editingId || this.renameSaving) return;
    const id = this.editingId, title = this.renameDraft.trim();
    if (!title) return;
    this.pendingTitles.delete(this.editingId); this.scheduleTitles();
    this.renameSaving = true; this.renameError = ''; this.renderThreads();
    try {
      await this.api({ action: 'rename', id, title });
      this.threads = this.threads.map(thread => thread.id === id ? { ...thread, title } : thread);
      this.editingId = '';
    } catch (error) { this.renameError = this.errorText(error); }
    finally {
      this.renameSaving = false; this.renderThreads();
      if (this.editingId) this.q<HTMLInputElement>('.chat-thread-rename input').focus();
      else this.querySelector<HTMLElement>(`.chat-select[data-id="${id}"]`)?.focus();
    }
  }
  private async configureChallenge(key: string) {
    if (!hasChatConsent()) return;
    this.challengeKey = key;
    if (this.challengeId || this.challengeLoading) return;
    this.challengeLoading = true;
    const container = this.q('.chat-challenge'); container.hidden = false;
    try {
      if (!window.turnstile) await new Promise<void>((resolve, reject) => {
        let script = document.querySelector<HTMLScriptElement>('script[data-chat-turnstile]');
        if (!script) { script = document.createElement('script'); script.dataset.chatTurnstile = 'true'; script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; document.head.appendChild(script); }
        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', () => reject(new ChatRequestError(this.t('The bot check could not load. Please refresh.', 'Δεν φορτώθηκε ο έλεγχος ασφαλείας. Ανανεώστε τη σελίδα.'))), { once: true });
      });
      if (!hasChatConsent()) return;
      this.challengeId = window.turnstile!.render(container, { sitekey: key, action: 'site-chat', theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light', size: container.clientWidth < 300 ? 'compact' : 'normal', appearance: 'interaction-only', retry: 'auto', language: this.el ? 'el' : 'en',
        callback: (token: string) => { delete container.dataset.interactive; this.challengeToken = token; container.hidden = true; this.clearChallengeNotice(); this.updateControls(); },
        'before-interactive-callback': () => { container.hidden = false; container.dataset.interactive = 'true'; this.clearChallengeNotice(); },
        'after-interactive-callback': () => { delete container.dataset.interactive; container.hidden = !!this.challengeToken; },
        'expired-callback': () => { this.challengeToken = ''; container.hidden = false; this.updateControls(); },
        'timeout-callback': () => { this.challengeToken = ''; container.hidden = false; this.updateControls(); },
        'error-callback': () => { this.challengeToken = ''; container.hidden = false; this.notice(this.t('The security check was interrupted. Please try the check below.', 'Ο έλεγχος ασφαλείας διακόπηκε. Δοκιμάστε ξανά παρακάτω.'), 'challenge'); this.updateControls(); },
      });
    } catch (error) { this.notice(this.errorText(error), 'challenge'); }
    finally { this.challengeLoading = false; this.updateControls(); }
  }
  private async send() {
    if (!this.applyConsent()) return;
    const question = this.input.value.trim();
    if (!hasChatConsent() || !question || this.busy || this.answering || this.input.disabled || (this.challengeKey && !this.challengeToken)) return;
    const threadId = this.active || crypto.randomUUID(), persona = this.persona, challengeToken = this.challengeToken;
    this.detailRequest++;
    this.challengeToken = ''; if (this.challengeId) { this.q('.chat-challenge').hidden = false; window.turnstile?.reset(this.challengeId); }
    if (!this.active) {
      this.setActive(threadId); this.unconfirmedThreads.add(threadId);
      this.threads.unshift({ id: threadId, title: 'New conversation', archived: 0, questions: 0, updated_at: Date.now(), persona });
    }
    if (this.turns === 0 && this.threads.find(thread => thread.id === threadId)?.title === 'New conversation') {
      const fallback = question.replace(/\s+/g, ' ').slice(0, 64);
      this.pendingTitles.set(threadId, { fallback, expires: Date.now() + 60000 });
      this.threads = this.threads.map(thread => thread.id === threadId ? { ...thread, title: fallback } : thread);
      this.scheduleTitles();
    }
    const attachments = [...this.attached], sourceKey = attachments.map(source => source.url).sort().join('|');
    let retry = this.retries.get(threadId);
    if (!retry || retry.question !== question || retry.sourceKey !== sourceKey) {
      retry = { question, id: crypto.randomUUID(), sourceKey }; this.retries.set(threadId, retry);
    }
    const optimistic: ChatMessage = { id: retry.id, question, answer: null, sources: [], context_sources: attachments, status: 'pending', persona };
    const run = { messages: [...this.messages.filter(message => message.id !== optimistic.id), optimistic], turns: this.turns + 1, persona, progress: 'searching' as 'searching' | 'thinking' };
    this.running.set(threadId, run); this.messages = run.messages; this.turns = run.turns; this.progress = run.progress;
    this.notice(''); this.attached = []; this.input.value = ''; this.renderAttachments(); this.closeSources(); this.closeMenus();
    clearTimeout(this.pollTimer); this.input.dispatchEvent(new Event('input')); this.renderThreads(); this.renderMessages(true);
    // Move directly to this reply, including when older answers filled the view.
    const reply = this.q('.chat-messages').querySelector<HTMLElement>(`[data-message-id="${optimistic.id}"]`);
    if (reply) { const area = this.q('.chat-messages'); area.scrollTo({ top: area.scrollTop + reply.getBoundingClientRect().top - area.getBoundingClientRect().top - 16, behavior: 'instant' }); }
    // Each attempt owns its identifiers and callbacks; changing the view cannot
    // redirect tokens, clear another draft or create a second conversation.
    let accepted = false, failure = '';
    try {
      if (this.unconfirmedThreads.has(threadId)) {
        await this.api({ action: 'create', id: threadId, persona }); this.unconfirmedThreads.delete(threadId);
      }
      await this.api({ action: 'ask', id: threadId, question, sourceUrls: attachments.map(source => source.url), requestId: retry.id, persona, lang: this.el ? 'el' : 'en', challengeToken, stream: true }, undefined, event => {
        if (event.type === 'title') {
          if (event.id !== threadId || !hasChatConsent()) return;
          this.listRequest++; this.pendingTitles.delete(threadId); this.scheduleTitles();
          this.threads = this.threads.map(thread => thread.id === threadId ? { ...thread, title: event.title } : thread);
          this.renderThreads(); return;
        }
        if (this.running.get(threadId) !== run || !hasChatConsent()) return;
        if (event.type === 'status') run.progress = event.phase;
        else if (event.type === 'answer') optimistic.answer = event.answer;
        else if (event.type === 'done') { optimistic.answer = event.answer; optimistic.sources = event.sources; optimistic.model = event.model; optimistic.status = 'done'; }
        if (this.active === threadId) { this.progress = run.progress; this.renderLiveAnswer(optimistic); }
      });
      accepted = true; this.retries.delete(threadId);
    } catch (error) {
      if (error instanceof ChatRequestError && error.recorded) { this.retries.delete(threadId); accepted = true; }
      failure = this.errorText(error);
      if (!accepted && hasChatConsent()) {
        this.drafts.set(threadId, { text: question, attached: attachments });
        if (this.active === threadId) { this.input.value = question; this.attached = attachments; this.renderAttachments(); }
      }
    } finally {
      if (this.running.get(threadId) !== run) return;
      this.running.delete(threadId);
      if (!hasChatConsent()) return;
      await this.load(false);
      if (this.active === threadId) {
        if (this.unconfirmedThreads.has(threadId)) { this.messages = run.messages.filter(message => message !== optimistic); this.turns = run.turns - 1; this.renderMessages(false); }
        else await this.loadMessages(false);
        if (failure) this.notice(failure);
        this.input.dispatchEvent(new Event('input'));
      }
      this.renderThreads(); this.updateControls();
    }
  }
}
if (!customElements.get('site-chat')) customElements.define('site-chat', SiteChat);
