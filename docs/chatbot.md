# Site guide: operations and release

The site guide lives at `/chat/` and `/el/chat/`, with the same client exposed as a non-modal resizable companion panel on other pages. The panel animates from the launcher and minimizes back into it. It floats over the site at every screen size without shifting the page layout or locking scrolling and navigation. Open state, dimensions, selected conversation, and unsent drafts persist within the browser tab across site navigation. Edge/corner dragging and an arrow-key resize control enforce viewport-aware minimum/maximum dimensions; narrow panels use a stacked history layout. Motion respects reduced-motion preferences. It uses OpenRouter for generation, Pinecone for semantic + BM25 retrieval with RRF and optional free model reranking, and Cloudflare D1 for private history, atomic quotas and the keyword fallback. See [Pinecone setup and infrastructure](./chat-pinecone.md). Cloudflare AI Search is not used. It does not fetch arbitrary URLs, browse the web, execute tools, or generate code.

## Local setup

Use Node 22.13+ (Node 24 recommended; the test suite uses `node:sqlite`).

1. Configure local settings in your existing ignored `.env`, using `.dev.vars.example` as a checklist. Keep the existing OpenRouter key unchanged, and add a random `CHAT_IP_SECRET` of at least 32 characters and Turnstile keys. Alternatively use ignored `.dev.vars`, which takes precedence in Wrangler; keep the runtime secrets together in the selected file. Never commit secrets.
2. Run `npm run db:migrate:local`.
3. Run `npm run build`, then `npm run chat:index:local`.
4. Run `npm run dev:local`. Open `http://localhost:8789/chat/`.

Use the official [Turnstile test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) for localhost. Add this public test pair to the ignored local `.env` (or `.dev.vars`), then restart the local server:

```dotenv
CHAT_REQUIRE_TURNSTILE=true
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Cloudflare dashboard secrets are not automatically copied to local development. The test pair exercises the browser widget and Siteverify request, but always passes instead of performing real bot detection. Cloudflare's marked dummy response uses placeholder hostname/action data; the server accepts it only on `localhost`, `127.0.0.1` or IPv6 loopback, with an approved public test pair. Test responses and known test credentials are rejected on production domains. Real credentials retain exact hostname and `site-chat` action validation on every host.

 `CHAT_REQUIRE_TURNSTILE=false` is an explicit local-only bypass; production defaults to requiring the challenge. No OpenRouter key is included. Mocked tests do not contact a model.

## Production release

The checked-in configuration has `CHAT_ENABLED=true` and `CHAT_REQUIRE_TURNSTILE=true`. Deployment activates answering only after the required production configuration and content index are present. Answering fails closed when the database, index, key, model, IP secret, or required Turnstile keys are missing.

1. Create a Turnstile widget with the production hostname and configure its public `TURNSTILE_SITE_KEY` and secret `TURNSTILE_SECRET_KEY` in Cloudflare Pages.
2. Set `OPENROUTER_API_KEY` and `CHAT_IP_SECRET` as **secrets**, and `CHAT_MODEL`, `CHAT_SECONDARY_MODEL`, `CHAT_TERTIARY_MODEL`, `CHAT_FALLBACK_MODEL`, and `CHAT_TITLE_MODEL` as server variables. The independent decision cascade uses `CHAT_DECISION_MODEL`, `CHAT_DECISION_SECONDARY_MODEL`, `CHAT_DECISION_TERTIARY_MODEL` and `CHAT_DECISION_FALLBACK_MODEL` (defaults: `baseten/mammoth-1:free`, `baseten/elephant-1:free`, `inception/mercury-decide:free`, `typesafe/jev-1.14`). The primary model is `nvidia/nemotron-3-ultra-550b-a55b:free`, followed by `google/gemma-4-31b-it:free`, `openrouter/free`, then `z-ai/glm-5.3-flash` on errors; verify availability with your key and the required JSON and provider settings before enabling. The API never accepts a client-selected model or provider URL.
3. Set a small hard spending limit on the dedicated OpenRouter key. The app caps accepted questions and completion tokens, not currency costs or OpenRouter's internal provider-routing attempts.
4. Run `npx wrangler d1 migrations apply mpalaourg-site-cache --remote` before releasing the routes, including `0004_chat.sql` and the additive Pinecone mapping/rerank-budget migration `0005_chat_pinecone.sql`. Build the site and run `npm run chat:index:remote` against the intended database. These commands mutate production; run them deliberately in your release pipeline. This implementation does not run remote commands automatically.
5. Run the live model evaluation below and manually review factual accuracy, refusals, citations, English, and Greek. Check at least one real production Turnstile validation, including the expected hostname and `site-chat` action.
6. Configure a Cloudflare rate-limiting/WAF rule for `/api/chat/*` to bound abusive GETs and management operations (for example, 60 requests per IP per minute, tuned for your traffic). The model budget does not protect unmetered history/database operations. Turnstile is verified before new question reservations. Managed widgets use `interaction-only` appearance: background verification leaves no reserved blank row, and an interactive challenge appears in a centered, bounded container above the composer. Narrow layouts use the compact size. The widget uses the current site theme and chat language; its iframe is not restyled or hidden by custom CSS.
7. `CHAT_ENABLED=true` is already set in `wrangler.jsonc`; keep this file as the authoritative production variable source. Wrangler variables may override dashboard variables; keep one authoritative source. Redeploy and smoke-test both locales and the bubble.

For content changes, rebuild and reapply the index. Keep answering disabled during reindexing: the import replaces index rows before writing the new version marker. Apply the matching index in the release process; a normal `npm run build` only prepares the local SQL file. The shared D1 index is separate from the site artifact, so coordinate deployments and retain the preceding `.chat/index.sql` for rollbacks. Use a separate D1 database and separate keys for preview deployments; previews must not modify production quotas or content.

## Retrieval and topic policy

The NVIDIA free endpoint does not support OpenRouter's `response_format: {type: 'json_object'}` parameter. Its requests omit that flag and request the same JSON envelope through the system prompt. Parsing, topic policy, citation validation, streaming preview checks, and fallback behavior remain enforced. The other models retain JSON mode. A direct comparison confirmed that the flag caused NVIDIA's parameter-filter 404; the corrected chatbot request then completed with streaming and a validated citation.

Completed model responses include a quiet “Answered with” badge beneath the citations (localized in Greek), using a readable model name without the `:free` suffix. The successful model in the server-controlled fallback sequence is stored per message and included in the final stream event and history API. Older messages and local policy refusals have no model badge; unknown attribution is never guessed.

Submitting a question immediately opens the user/assistant message pair with a localized searching indicator, cycling thinking labels, and three animated dots (static for reduced motion). The browser requests SSE over a POST after the same consent, bot, ownership, and quota checks. OpenRouter streams structured JSON; only the answer string from an allowed envelope with valid source IDs is previewed through the same restricted Markdown renderer as saved replies. Raw JSON and reasoning are never displayed. Providers that reorder fields may buffer until completion. Final validation and persistence precede the final event and citations; an invalid or interrupted model attempt clears its preview before the fallback starts. A disconnected browser can reopen the saved conversation; retries reuse the request ID and never reserve another turn. Streaming does not bypass topic checks, budgets, provider privacy settings, or final validation.

`scripts/index-chat.mjs` parses built HTML with parse5. Only home, About, Projects, Publications, and Formula pages in English/Greek are eligible. The Formula section includes all built season articles, the racecraft guide, and every drivers’/constructors’ championship decade page in both languages. Scripts, styles, navigation, forms, hidden nodes, live widgets, chat history, API responses, private files, and credentials are excluded.

Project articles can set `chatIndex: pending` in frontmatter while awaiting owner validation. The project template emits a `chat-index` marker; the shared extractor excludes the entire detail page from D1 knowledge, Pinecone passages, source catalogs and image evidence. The website can still show the article and its listing summary. The English and Greek site-assistant project articles are now approved (`chatIndex: approved`) and included in the prepared corpus. For future pending articles, explicit validation must precede changing the status to `approved`; then rebuild and follow the normal environment-specific Pinecone synchronization and matching D1 activation sequence. A regular build does not publish remote index changes.

The reviewed allowlist in `src/lib/chat/documents.json` also includes both CVs, the public research/project/thesis PDFs, and all four public PPTX presentations, including the Workflows to Agents workshop. Maintainer-time Docling extraction prepares verified page text from the PDFs; builds consume the saved artifacts. PPTX extraction reads visible slide text in presentation order. Speaker notes, embedded attachments, code files, and ZIP downloads are excluded; no external document links are fetched. PDF layout, table structure and detected formulas are processed locally. General image-only text, diagrams, screenshots and presentation images are not interpreted. Extraction fails the build if a listed file is missing or has no readable text. Documents are chunked per page/slide with readable source titles and citations to the original public download; only allowlisted document URLs pass the server retrieval filter.

Overlapping chunks are prepared in ignored `.chat/index.sql`, with a complete source/section inventory in `.chat/sources.json`. The deployed index version/date is available in the chat state endpoint. A reviewed allowlist and site source control determine what the assistant knows.

D1 FTS5 searches quoted literal Unicode tokens using bound SQL parameters. There are no conversational keyword classifiers, synonym maps, greeting lists, code-request regexes or publication-routing aliases. After intent routing, the planning call receives reviewed source titles/URLs as navigation metadata and decides the conversational intent and evidence needs. Factual questions require **one bounded evidence acquisition step** with up to four search phrases, five exact catalog URLs and three reviewed paper IDs. The model resolves paraphrases, cross-language questions and follow-ups by meaning. No factual excerpts are supplied during planning; after a validated plan, a second model call writes from the acquired evidence. Greetings, clarifications and refusals can finish during planning without that extra call. Metadata itself is not evidence. Selected documents use query-ranked excerpts and evenly spaced page samples within the context budget; short documents can fit in full. Explicit @ attachments restrict all evidence retrieval. Citation lookups use reviewed DOI metadata, never a model-supplied destination.

The system prompt in `src/lib/chat/policy.ts` decides scope, greetings, clarifications, refusals and answer composition. It separates server-authored instructions from untrusted questions, history, documents and catalog text, and covers fake authority, mixed requests, encoded disclosure and multi-turn extraction. Code retains structural input checks (fences/control characters), quotas, allowlists, bound SQL, JSON/citation/link validation and output limits. A defense-in-depth scan rejects long copied instruction spans, including reversed/base64 copies. It cannot detect every paraphrase or prevent all partial streamed disclosure. Prompts contain no API keys or credentials.

Substantive answers require valid evidence IDs; brief courtesy, clarification and refusal envelopes have no citations and a 600-character ceiling. Refusals are written by the model in the selected language/persona. A valid refusal is final; malformed responses try the next route and exhausted routes produce a saved failure. A fixed localized refusal remains only for structurally rejected input. The browser renders Markdown safely without inserting model HTML; outbound links retain the existing destination checks and external-site confirmation.

OpenRouter keeps the four-route order, a 30-second timeout per call, 4,096 completion tokens, and provider `require_parameters: true`. The evidence step adds one call for factual questions: at most five planning/answer calls across all routes, plus up to four decision calls, under one shared 125-second decision/model/retrieval budget (135-second client timeout; 150-second pending lease). Models cannot execute code, choose SQL statements or browse arbitrary URLs. The separate title request is unchanged. The 200-question allowance is not a 200-inference ceiling; the last route is paid.

A valid source ID proves that evidence was retrieved, not that every generated claim follows from it. Prompt instructions and output validation reduce risk without guaranteeing zero hallucinations, out-of-scope answers or semantic prompt disclosure. Live checks should accompany prompt and model changes.

### Decision cascade

`src/lib/chat/decisions.ts` uses the separate [OpenRouter Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request): Mammoth-1 free → Elephant-1 free → Mercury Decide free → TypeSafe Jev 1.14. Each provider sees the same prompt-defined criteria and bounded question/history/attachment metadata. It does not receive the assistant's system prompt, credentials, full document corpus or owner-background records. Routes are factual, courtesy, clarification and refusal; an uncertain option and probability margins allow escalation without keyword rules. Fake role approvals, encoded instruction theft and mixed requests are covered in the criteria. Describing code or prompt injection in actual site material remains a factual request.

A valid choice must have a complete finite probability distribution, agree with its highest probability and sum approximately to one. The initial operating gate requires probability ≥0.8 and a ≥0.2 margin. These are conservative heuristics checked with live bilingual samples, not universal calibration claims or proof of accuracy on free models. Low-confidence free decisions, invalid output, HTTP/network failures and timeouts try the next decision model. A confident refusal is final. An uncertain final Jev decision asks the answer model for a natural clarification; a complete decision outage fails closed. No route bypasses the writer's independent scope and evidence rules. Non-factual routes cannot request retrieval or produce a factual reply. Replies still come from the existing chat-model cascade and retain their actual answer-model badge.

All calls share the request budget, with a maximum of 30 seconds per call. No new schema or migration is needed. Provider free quotas are separate from the site's visitor/global allowance. Before Mercury was added, 22 October checks of Mammoth and Elephant returned HTTP 429 for the account's daily free-model cap; Jev fallback was exercised successfully. Availability of free entries is checked against the decision-specific catalog (`/api/v1/models?output_modalities=decisions`), not the default text-model catalog. Free access and provider quotas can change independently of this application.

On 22 October, temporary live checks used the existing key without storing chats or spending visitor allowances. After rubric refinement, Jev correctly routed 28 English/Greek cases: courtesies, biographical questions, contextual follow-ups, legitimate published code/security topics, missing references, mixed tasks, private data and direct/encoded/history-based instruction theft. Four complete routing/planning/reply checks also completed. The free decision models could not be assessed for accuracy because the account's free allowance was exhausted. Earlier answer-model checks still encountered HTTP 429 and 30-second timeouts on some detailed paper requests; classification does not fix those provider limits or guarantee factual entailment.

## Quotas and history

- 200 accepted questions shared per UTC day; 10 per IP per local calendar day; 4 per conversation, including refusals and provider failures. Invalid input, failed bot checks, and rejected limits do not consume a question.
- Three accepted questions per IP per minute limits bursts. The 4-turn limit persists across days for the same thread.
- Reservations use SQLite triggers inside the same atomic D1 batch as message insertion. Concurrent writers cannot exceed the budgets. A unique request ID makes retries idempotent. Only one pending question per thread is accepted. Interrupted pending messages become failed after 150 seconds on the next API request. Quotas are not refunded because the provider may already have billed the request.
- Daily usage is independent of messages/threads and survives their deletion. The IP is HMACed with the local calendar date using a server secret. A separate keyed IP identifier pins the validated browser IANA timezone (Cloudflare timezone, then UTC as fallbacks) while that IP remains active, so changing the browser timezone or clearing cookies cannot replenish its allowance. The timezone profile expires after 48 hours of inactivity. Both the local-day key and next-midnight timestamp use server time and account for DST. People sharing an IP share the pinned timezone and allowance; a timezone change takes effect after the profile expires. The shared budget still uses UTC, and the UI distinguishes the two reset times. Only Cloudflare's `CF-Connecting-IP` is trusted; raw IPs are not stored in D1. The production endpoint fails closed without a platform IP. IPs are shared behind NAT and change with VPNs/mobile networks; these are abuse controls, not identity verification. Cookie deletion cannot reset an unchanged IP's budget. IP rotation can evade it. Usage rows retain the current UTC day and two preceding days so a local day can cross UTC boundaries; do not rotate the HMAC secret mid-day without accepting a quota reset.
- Random 256-bit anonymous cookies identify a browser. Production uses an HttpOnly, Secure, SameSite=Strict, host-only `__Host-site_chat` cookie. D1 stores its SHA-256 hash; every history read/mutation checks ownership. Mutations require matching Origin and JSON. There is no login or cross-device sync. Someone sharing a browser profile can read that profile's chat history.
- Titles are generated by a separate `CHAT_TITLE_MODEL` (default `nvidia/nemotron-3-ultra-550b-a55b:free`) once on the first accepted question, in parallel with answering. This adds at most one 30-second, 512-token model call per new chat, outside the question allowance, with no paid retry. Titles use the first question plus bounded excerpts from explicitly attached pages, without running an additional keyword search, preserve specific project names, and are prompted to avoid generic labels such as “Site conversation”; code validates only their format and size. Short titles use the chat language; if generation fails or returns an invalid title, the first question (up to 64 characters) is used instead. The first-question fallback is saved atomically with the first accepted message, so an interrupted title job cannot leave “New chat” permanently. Generated titles persist independently as soon as they arrive; they do not wait for the answer, and answer completion does not wait for them. A title event updates its own sidebar row while the stream is open; after answer completion, bounded metadata-only polling discovers late titles. Later questions no longer cancel title saving by changing updated_at. A different manual title wins through a compare-and-set on the fallback value. Sidebar rows are reconciled in place, preserving the current conversation, draft, scroll position and rename input. Users can rename to 80 characters. Archive is reversible; delete is permanent and cascades to messages. Deleting all history leaves daily usage intact.
- Each browser is limited to 50 retained threads and the database to 5,000 threads. History expires after 30 days without a question/rename/archive update. API access lazily removes expired history and old usage; without traffic, physical deletion waits for the next request. For strict timed physical retention, schedule `DELETE FROM chat_threads WHERE updated_at < (unixepoch() * 1000 - 2592000000)` and `DELETE FROM chat_usage WHERE day < (unixepoch() / 86400 - 2)` and `DELETE FROM chat_visitors WHERE updated_at < (unixepoch() * 1000 - 172800000)` via an external maintenance job. Cloudflare Pages does not supply this app with a scheduled handler.

## Privacy and monitoring

`chat_storage_failure` logs contain a fixed operation stage and a sanitized category (for example `read_messages` / `busy`, or `list_threads` / `schema_missing`). Known missing columns/tables include the matching migration filename as a diagnostic hint. Raw exception messages, SQL, values, questions, IPs, and secrets are never logged. Retrieval/persistence failures are distinguished from model failures and bot-verification errors. Invalid legacy citation JSON is treated as an empty citation list so one damaged field cannot make an entire conversation unavailable; saved rows are not rewritten.

The interface shows a brief AI accuracy footer, as requested. The bilingual `CookiePopup.astro` notice was restored from the component removed in commit `d4e06a2`, with updated chat/storage/provider disclosures. The banner now offers explicit acceptance or refusal and can be reopened through “Cookie settings”. `/api/chat/consent` records a versioned `site_cookie_choice` cookie for 180 days after a same-origin JSON POST. Legacy dismissal flags are not acceptance. All chat API requests fail with `consent_required` before session creation, D1 access, or model calls unless the current accepted value is present. The browser also blocks chat history, sending, chat storage, and Turnstile loading until acceptance. Refusal leaves site browsing and the existing theme preference available, expires the chat session cookie, clears tab-local chat data, removes the challenge widget, and synchronizes the locked state to other tabs through BroadcastChannel. Refusal does not delete already stored D1 conversations: they retain the existing expiry policy; delete them before withdrawing if immediate history deletion is wanted. Requests already accepted before withdrawal may finish on the server. The consent cookie is a preference, not an authentication credential or proof of legal compliance. Before public launch, include the cookie, IP-limit, retention, and OpenRouter/provider processing details in the site’s privacy policy. Questions plus up to three prior exchanges are sent to OpenRouter and its selected model provider. Bounded search queries and public retrieval/reranking passages are sent to Pinecone; private conversation history is not uploaded to its index. Site content is public; visitor questions may be personal. Do not submit secrets. Deletion removes local D1 history, not any upstream/account-level logs; review OpenRouter account data settings as well as request-level provider routing. Cloudflare infrastructure may maintain its own request logs. The app logs only failure classes and random request IDs, not question text, answers, IPs, or API keys.

Watch Cloudflare errors for `chat_storage_failure` and `chat_provider_failure`, unexpected quota depletion, and OpenRouter costs. To stop model traffic, set `CHAT_ENABLED=false` and redeploy; history reading/deletion still works. Preserve the D1 migration on rollback. This feature does not enable admin access to visitor transcripts.

## Checks

`npm test` covers SQL budgets, pending/archive rules, deletion, ownership, CSRF, request sizes, idempotency, mocked provider success/failure, citation validation, and common English/Greek attacks. `npx tsc --noEmit` checks TypeScript. `npm run build` validates generated pages/images and prepares the content index.

Local Wrangler can load `OPENROUTER_API_KEY` from `.env` without printing it. When `.dev.vars` exists, follow Wrangler’s environment-file precedence; keep a real key out of tracked templates.

For a live model evaluation, build first and run `node --env-file=.env scripts/eval-chat.mjs`. This makes maintainer-initiated OpenRouter requests (with the configured fallback) outside website quotas and writes `.chat/eval.json`. It never prints credentials. Review the report, not just its pass count: automated checks validate scope/citations, not factual entailment. Keep any real visitor data out of evaluation cases.

The Greek feature copy covers controls, consent, limits, confirmations, refusal text, validation errors, and saved failure messages. `X-Chat-Language` selects localized API errors, and the model prompt requests natural Greek phrasing.

For a single public-content live check, run `npm run chat:smoke`. Node loads
credentials from `.env` for authentication; the script prints only safe test
summaries. It applies migrations `0004` and `0005` in memory, imports the prepared
corpus, uses the development settings from Wrangler and explicitly bypasses the
starter cache. Configured Pinecone retrieval and model fallbacks run normally.
The test leaves real conversations and visitor allowances untouched. A configured
LangSmith key exports a synthetic development trace through the normal best-effort
path.

Use `npm run chat:smoke -- --stream` to include streaming previews and timings.
The preparation check on 25 October 2026 produced a cited streamed answer through
`z-ai/glm-5.3-flash`. Earlier routes returned invalid output, HTTP 429 and a timeout;
the full request took about 73 seconds. Provider availability affects both route
selection and latency.

Thinking labels use a locally stored, versioned list of 187 Claude Code v2.1.63 spinner words from the [MIT-licensed extractor project](https://github.com/jaehongpark-agent/claude-code-spinner-verbs/blob/main/words/2.1.63.md), with natural Greek phrases for Greek chats. Labels rotate every 2.4 seconds until answer text appears. Screen readers receive one stable status label; timers stop on text, completion, consent withdrawal, and component removal.

The explicit `zdr: true` routing requirement was removed at the owner’s request after direct calls showed that it excluded both free model endpoints. The explicit `data_collection: deny` routing restriction was subsequently removed at the owner’s request. Provider retention and data usage now follow OpenRouter account settings and the selected provider’s policy.

The browser allows 135 seconds for the four bounded model attempts; pending messages expire after 150 seconds. HTTP 200 followed by a response-body timeout is logged as `timeout` with elapsed time rather than `invalid_response`. The third route, [`openrouter/free`](https://openrouter.ai/docs/guides/routing/routers/free-router), selects an eligible free model. Model attribution uses the actual `model` returned in completion or stream metadata, falling back to the requested route only if absent.

The title request allows a larger token budget because some routed models include mandatory reasoning in that budget; only the final short title is accepted. Refused/off-topic messages still receive descriptive labels; the title task never carries out their requested work. History action menus dismiss on outside pointer/click, keyboard focus moving away, Escape (returning focus to the trigger), and selecting an action.

The title default uses the NVIDIA free model rather than the random free router after live checks showed router-selected models exhausting the title output budget. A live NVIDIA check returned “Workflows to Agents Workshop” for the matching workshop question. The answer-routing sequence is unchanged.

## Answer personas

The composer’s **Style** disclosure selects Baseline, Fun (dry wit), Race Engineer (calm radio-style delivery), Formal, or Quick Take. The same picker appears inside both the floating and dedicated-page input, with localized Greek labels, icons, a selected indicator, native radio semantics, arrow-key browsing/Enter confirmation, outside-click/Escape dismissal, and a height-bounded scrolling menu. Style changes apply to subsequent replies and persist per conversation; each message records its own style. The tab’s preferred style is retained only with accepted chat cookies and cleared on withdrawal.

`0004_chat.sql` includes the persona columns in the initial chat schema. Apply it before the first chatbot release. Only the five server-defined IDs are accepted; client-supplied style instructions are never used. All styles share the site-only scope, retrieval, citations, refusal rules, limits, model sequence, and title generation. Fun is dry and restrained, without claiming private knowledge of Georgios’s humor; Race Engineer does not invent telemetry or live race information. A pending answer’s style cannot be changed in flight.


## Attached sources and walkthrough

Typing `@` in the composer opens a keyboard-accessible picker with at most five results total across pages and files. The same cap applies to the initial suggestions and filtered searches; typing after `@` filters the catalog before the best five results are selected. Matching filters by titles, filenames/paths, and indexed content, supports partial words, and ranks title and filename matches before content-only matches. Empty Pages/Files categories are hidden; if neither matches, a single empty-state message appears. It never fetches arbitrary URLs. The separate **Sources** control has an **Attach a source** shortcut that reuses an existing `@` instead of inserting duplicates. Enter attaches the highlighted result, arrow keys browse, Escape/outside click dismiss, and removable chips sit inside the composer. Each question accepts up to five distinct sources, separate from the 125-character question allowance. Draft sources follow the existing consent-gated tab storage and are cleared on withdrawal.

The API validates source URLs and confirms that each exists in the current index before reserving a question. With attachments, retrieval is restricted to those sources (the full indexed text of short sources when it fits, otherwise opening context plus ranked relevant excerpts, bounded to 24,000 source-text characters in total). All scope, injection, citation, model and quota checks still apply. The selected references are saved per question in `context_sources`, so reopening a conversation retains the source chips. The initial `0004_chat.sql` migration includes this column. This does not enable visitor uploads or indexing of code/ZIP files.

A six-step English/Greek tour covers scope and the question-check → retrieval → reply flow, filtered @ pages/files, personas, copy/download/ZIP and external links, navigating while answers run and the resizable bubble, and limits/history/contact controls. Internal model names, routing probabilities and thresholds are not exposed in the tour. It appears once for an accepted-cookie visitor opening an empty available chat, can be dismissed with the button or Escape, and is replayable through the separate **Tour** control. It offers Back/Next/Done and stores its dismissal locally only after chat consent. The shared 200-question allowance uses UTC; the 10-question IP allowance uses local midnight.


## Migration baseline

All unreleased chat schema work is consolidated in `migrations/0004_chat.sql`: history, quotas, the public FTS index, pinned visitor timezones, model attribution, personas, and attached sources. Migrations 0001–0003 predate the chatbot and remain unchanged. Add incremental migrations only for schema changes after this baseline is released.

A local database that already applied the earlier development sequence through 0008 already has the same final schema. Its migration ledger may retain those old filenames; keep those records and the existing data. Do not reset the database or reapply 0004. Fresh environments apply the single consolidated 0004 file. Partially migrated development databases must be brought to the final schema before using this baseline. Never squash a migration that has already been released to production.


## Reply formatting

Streaming and saved replies share `src/lib/chat/markdown.ts`. A CommonMark parser supplies an AST; a restricted DOM builder supports bold, italic, paragraphs, ordered/unordered and nested lists, blockquotes, modest headings, line breaks, and inline code. It never uses `innerHTML`. Raw HTML is literal text, images become their alt text without loading remote resources, and links use validated HTTP(S) destinations. Markdown links, reference links, angle autolinks and bare HTTP(S) URLs are clickable outside literal code and math. The server accepts only destinations found in cited evidence, and indexing retains published HTML anchor destinations without fetching them. Approved citations remain separate. Parsing is bounded to 3,200 characters and 24 levels of nesting. User questions and error notices remain plain text.

The renderer supports triple- and quadruple-backtick fences as inert, horizontally scrolling text, including nested literal triple ticks. The API permits formatting existing published quotations this way, while code-generation requests remain outside scope. Inline and display LaTeX support dollar delimiters and backslash parentheses/brackets. KaTeX loads only when math is present, uses local fonts and accessible MathML, and disables trusted HTML/URL commands. Expansion, size and expression length are bounded; malformed or incomplete formulas fall back to literal text. A bounded cache avoids re-typesetting unchanged equations on every streamed token. Plain-text copy retains readable LaTeX source and literal code content.

The composer exposes three independent controls: **Sources** (@ references), **Style** (persona picker), and **Tour** (walkthrough). Sources and Tour are direct buttons, outside the style disclosure, in both chat layouts and languages.


## Copying replies

Completed answers have a copy icon below the reply. Its two choices copy the original answer string (**As written**, retaining Markdown) or a structured plain-text version (**Plain text**, removing emphasis, heading and quote markers while retaining paragraphs, readable list bullets/numbering, and literal technical terms). Citations and model badges are not part of the copied answer. The menu is bilingual, keyboard-accessible, dismisses on outside click/focus and Escape, and shows local success/failure feedback. Clipboard access happens only on the visitor’s click; replies are never copied automatically.

The header is labeled **AI Assistant** (Βοηθός AI). The sidebar toggle is the far-left split-panel icon. With history collapsed, a compose icon beside it starts a new chat; with history expanded, the sidebar button shows the same icon and **New chat** label. Both layouts share these controls.

## Reply file downloads

A download icon beside Copy response lists unique cited PDFs/PPTX files from the reviewed document allowlist. It is disabled when a reply cites no downloadable files. Individual entries use native same-origin download links. Download as ZIP is enabled for two or more files, disabled for one. ZIP preparation happens on demand in the browser, loads fflate lazily, rejects redirects/error pages, and bounds each file to 25 MiB and the archive input to 64 MiB. Existing compressed documents are stored without re-compression. It never bundles arbitrary links, source code, or an existing ZIP download. Localized status feedback reports preparation or failure.

The dedicated chat page places Cookie settings in a normal footer row below the workspace, reserving its height instead of floating over the sidebar retention note. Other site pages keep the existing fixed cookie-settings control.

## Answer prompt and bilingual styles

The answer prompt separates scope/evidence rules, a server-selected language guide, and the current persona. Both language guides and all five personas include concrete phrasing examples, explicitly marked as illustrations rather than factual sources. Greek guidance covers company gender/case (η/στην/της EY and Kaizen Gaming), natural technical terminology, register and name inflection. English answers remain English when evidence is Greek, and vice versa. The title prompt also uses natural Greek company phrasing.

The @ attachments define the current question's evidence boundary. Retrieved excerpts resolve “this file” before history; ambiguous references across attachments ask for clarification. Long-document retrieval prioritizes question-matching excerpts within each attachment's budget, retaining opening context when room remains. History is reference context, never independent evidence. Successive roles at one employer are grouped without inventing a promotion or departure. Published personal interests can enrich relevant answers; rotating widgets and quotations do not establish personal habits or preferences. Persona voice changes delivery without adding biographical claims or weakening refusals.

On 21 October 2026, prompt development used temporary live-query runners against the public in-memory index, outside visitor quotas. The queries were reviewed for actual wording, grounding, grammar, tone, attachment use and refusals; no additional permanent evaluation suite was added for this audit.

Live checks exposed truncated JSON at the former 900-token completion ceiling, including on the paid fallback. A follow-up check still truncated one response at 1,800 tokens. The ceiling is now 4,096 tokens per attempt so Greek output and model reasoning can finish; the 3,200-character answer validation, concise-answer prompt and 30-second attempt timeout remain. Length-limited completions are logged as `truncated_output`. Cross-language or paraphrased follow-ups can now request model-selected search terms and reviewed source URLs instead of relying on alias lookup.

The editorial voice follows the owner's feedback: direct, informal, specific and dryly humorous, without copying typos, frustration or habitual slang. Fun uses topic-specific wit in the opening and throughout the explanation. Race Engineer uses radio cadence, short factual beats, priorities and supported watch points. Both have bilingual examples and retain the same evidence and scope rules. The shared answer validator converts em dashes into ordinary punctuation, preserving numeric ranges and Markdown list items, so previews, saved answers and copied text agree. Citation titles retain their original source names.

Live voice checks also exposed a routed model mixing Cyrillic lookalikes into Greek words. Such mixed-script words now fail the shared validator and use the existing fallback path; separate names written in another alphabet remain allowed. This catches that corruption pattern, not every possible grammar error.

Persona sampling stays at temperature 0 for Baseline, Formal and Quick Take; Fun uses 0.5 and Race Engineer 0.2 to allow more expressive phrasing. Source retrieval, allowed topics, output validation, timeouts and model order are identical across styles.

Baseline, Formal and Quick Take have separate delivery instructions and bilingual examples for summaries, research and narrow factual questions. Baseline leads with an accessible explanation before technical detail. Formal uses measured professional language without inheriting casual humour or becoming more verbose. Quick Take selects the main answer and any necessary caveat in one to three short sentences, targeting at most 60 words; it does not compress every retrieved detail into a long sentence. The shared voice explicitly defers register, humour, rhythm and length to the current selection, while evidence, uncertainty and scope requirements remain common. Live checks include switching away from a humorous or radio-style history and returning to the current source evidence.

## Document extraction and follow-up retrieval

### Navigation during a reply

Browser generation state belongs to a conversation ID, not to the selected view. Visitors can switch chats, open a new draft, minimize the bubble or toggle history while a reply runs. Returning to that chat restores its partial streamed answer without sending again. Stream callbacks cannot overwrite another chat's messages, progress, attachments or draft. The current generating chat's composer/persona and its destructive history actions remain disabled; other chats remain navigable. A subtle history dot marks running answers. Late detail responses are discarded using selection/request versions, including A-B-A navigation. Selecting a saved chat shows a localized loading skeleton until its messages arrive, never the new-chat welcome screen. Running chats restore their partial answer immediately; selecting the current chat does not reload it. Failed loads show a retry message rather than the welcome screen.

The client chooses a stable UUID before creating a new conversation, and the create API accepts that ID idempotently within browser ownership. Retrying an uncertain create reuses both its conversation ID and message request ID, preventing duplicate conversations or question reservations. This requires no schema migration. Send immediately scrolls the new assistant response into view; streaming follows the bottom only while the visitor stays near it. Drafts for chats switched within the component are kept separately in memory; the current draft retains the existing tab-storage behavior. Full browser navigation still uses the existing server persistence/polling path rather than replaying a question.

### Greetings and courtesies

The planning model handles greetings, thanks, farewells, acknowledgements and short social exchanges by meaning, in the selected language/persona. No hardcoded input vocabulary or canned greeting replies are used. A greeting prefix does not exempt the rest of a request from scope checks. A short “yes” can refer to a previous engagement question; missing context calls for clarification. Courtesy envelopes carry no invented evidence links, but do record the model that answered. Normal quotas and the separate first-chat title job still apply.

### Owner-approved background and citation counts

`src/lib/chat/owner-background.ts` validates owner-approved bilingual facts supplied through the server secret `CHAT_OWNER_BACKGROUND_B64`. No personal records are hardcoded in source, tests or documentation. The local editable records live only in ignored `.chat/owner-background.json`; `npm run chat:background:configure` encodes them for dotenv transport and securely syncs the production Pages secret. Base64 is not encryption: keep both the raw file and encoded value out of Git. Missing/invalid configuration supplies no background records. All configured facts reach the answer model without keyword gating, except when explicit attachments restrict the evidence boundary. This adds no HTML, public JSON, fabricated page citation or @ picker entry. The facts remain approved for relevant visitor answers; moving their storage out of Git does not make the chatbot's approved answers confidential.

The model can request incoming citation counts by selecting one or more of the three reviewed paper IDs. The server uses the existing Semantic Scholar endpoint/cache through a bounded DOI allowlist. The chatbot does not treat static PDF references as incoming citations or invent a count from its model knowledge. Successful observations include the provider and checked timestamp; the assistant must name Semantic Scholar and state the date, since counts differ across providers. Fresh cache entries last 24 hours. An expired fallback is explicitly described as an older observation, and a missing/invalid count is unavailable rather than zero. The lookup has a six-second network timeout and does not follow visitor-provided destinations. A publications-page citation points to the existing count display; this creates no extra biography section. No migration or public corpus re-import is needed for these server features. Normal chat limits apply.

### Maintaining PDF text

`scripts/extract-chat-pdfs.py` prepares page-aware Markdown with [Docling](https://github.com/docling-project/docling), using local layout, table and formula-recognition models. This is a maintainer operation, separate from normal Node builds and the Cloudflare runtime. It accepts only the public PDF allowlist and disables remote inference and external plugins. Embedded text is retained rather than replaced with English OCR, which matters for the Greek documents. Model weights download on first use; the Python environment and weights are not shipped to visitors.

```sh
uv venv --python 3.11 .chat/pdf-venv
uv pip install --python .chat/pdf-venv/bin/python -r scripts/requirements-chat-pdf.txt
.chat/pdf-venv/bin/python scripts/extract-chat-pdfs.py
```

Pass reviewed PDF URLs to update selected documents, for example `/media/files/icmr2022_preprint.pdf`, or `--force` to regenerate unchanged files. Review the extracted text against the PDF, especially equations, algorithm panels and tables. Commit the JSON text artifacts under `scripts/data/chat-pdf/` with their matching public PDFs. These are production **build inputs**: `npm run build` reads them to generate `.chat/index.sql`, which must be imported into the intended D1 instance. Committing or deploying the website alone does not update an existing remote search corpus. The JSONs contain public document text, not visitor data or secrets, and are not served as standalone downloads. Cloudflare requests search the imported corpus; they do not run PDF extraction.

The source-bound corrections in `scripts/data/chat-pdf-review.json` and their normalization code in `scripts/lib/chat_pdf_review.py` must also be committed. Corrections pin both the PDF SHA-256 and the original extracted page SHA-256. Re-extraction applies them reproducibly and stops if either changes, requiring a fresh page review. Artifacts record the correction manifest hash and review-policy version; Node builds reject artifacts with outdated review metadata, mismatching PDF hashes or incomplete page sequences. After editing the correction manifest, regenerate the affected artifacts (all artifacts record its hash), rebuild and refresh the intended index. No manual JSON edit should bypass the correction manifest.

The review covers all seven PDF artifacts (146 pages, including four blank thesis separators), with source-checked page corrections for table alignment, formula-recognition errors and contents-list ordering. ISM 2022 Table I is restored as 96 explicitly labeled records containing all 480 cells; each record preserves replacement function, dataset, replacement mode, metric and the five explanation signals. Other repairs include thesis model rows and parameter boundaries, grid-search ranges with dropped zeros, two Gower example matrices, the ICMR algorithm, JPEG transform coefficients and scientific-notation exponents, and the ISM positional-encoding denominator. CV font-mapping artifacts in bullets, dashes and Greek mu are normalized. The public PDFs themselves are unchanged. Mathematical oddities or inconsistent prose already present in a source are not silently rewritten as factual corrections.

Indexing expands Markdown tables into records with column labels on each row, so numeric values do not rely on a header in an earlier chunk. Inconsistent row widths fail indexing. Detected display equations are checked for valid KaTeX syntax in the index tests; syntax validation is not proof of mathematical correctness. The extraction still does not interpret image-only plots/diagrams, and less prominent inline symbols may need future source review. The assistant must explain supported concepts in words rather than reconstruct unreadable equations or invent values. PDF extraction normalizes line-break hyphenation while preserving common technical compounds. Overlapping chunks break at word boundaries, and document titles are not duplicated inside each page body, reducing metadata bias in FTS ranking.

Automatic retrieval no longer gives every subject six competing global excerpt slots. Follow-ups resolve their subject using the previous question, validated prior citation URLs and recognizable reviewed document titles. Publication questions expand to primary research PDFs, excluding CVs from that selection, with abstract/opening, method and evaluation/result excerpts balanced across papers. Total context remains capped at 24,000 characters. For short documents, explicit @ selections still include the full bounded text; larger attachments receive relevant sections without leaving their selected evidence boundary. Prior answers identify subjects, never become factual evidence. Local index refresh replaces only the public search corpus, preserving chat history and usage tables.


## Reply links and leaving the site

Links within mpalaourg.dev and mpalaourg.me (including their subdomains) navigate directly. Other destinations require a custom English/Greek confirmation naming the current site and destination hostname and showing the full URL. Stay here or Escape cancels; only Continue navigates. The same guard applies in the page and bubble, including keyboard and modified/middle-click activation. Outbound reply destinations remain inert until acknowledgement, including context-menu navigation. The acknowledgement uses a native link for reliable new-tab navigation, with noopener/noreferrer. Credentials, active protocols, protocol-relative URLs and hidden control characters are never rendered as links. Plain-text copying retains each link destination in readable parentheses.

## Conversation continuation and contact

After the fourth completed question, the composer is replaced by a quiet completion panel with a primary New chat action and a secondary link to the owner's public contact section (`/#contact` or `/el/#contact`). Starting a new chat does not reset daily quotas. If the daily allowance is exhausted, New chat is disabled and the contact option remains available. The panel waits until the pending answer finishes and works in the page and bubble.

`src/lib/chat/contact.ts` supplies trusted continuation instructions with the actual remaining reserved turns, including failed earlier attempts. Substantive, open-ended answers can include one specific next question about the current evidence. Narrow facts, clarifications, repeated prompts and final-turn replies do not need one. Collaboration, hiring, availability and speaking enquiries can instead receive a brief contact line, with no claims about availability, services, prices or response times. Contact suggestions are not appended to ordinary research or Formula 1 replies.

The model envelope includes an optional nullable `followUp` after `answer`. A bounded, plain-text question of up to 125 characters is validated and appended to the saved answer, keeping existing storage, streaming and copy behavior without a schema change or an additional model request. Invalid optional suggestions are omitted; the server suppresses them on the final turn and alongside a contact link. Both owner-approved contact anchors are permitted without allowing arbitrary new link destinations. Quick Take's total word and sentence budget still includes any follow-up. Temporary live checks covered English and Greek topic-specific endings, workshop invitations and final-turn answers; they do not consume visitor quotas.

## Before publishing source

Run `npm run audit:secrets` after staging. The audit inspects Git-index contents and built public client assets, reports only filenames/line numbers/rules, and never reads local `.env` or `.dev.vars` values. It rejects tracked secret/runtime files and checks ignore coverage. Known provider-key/private-key patterns and literal assignments are safeguards, not a guarantee that arbitrary sensitive information is absent. Public provider hosts, database IDs, model names, published CV/document text, and official Turnstile dummy keys are not authentication credentials. Keep real credentials and owner background only in server secrets.

## Shared starter-answer cache

The welcome screen has four questions per language, maintained in
`src/lib/chat/starters.ts`. Only these exact questions (apart from Unicode and
whitespace normalization) can use the shared server-side D1 cache, only on the
first turn, with no prior completed history or attached sources. General
questions, follow-ups, refusals and uncited responses are not cached. There is
no semantic/keyword approximation that could reuse an answer for another task.

The 40 starter answers are **generated through OpenRouter and reviewed before release**,
not generated on the first visitor request. `src/lib/chat/reviewed-starters.json` contains English/Greek
copy for all five styles, actual returned model IDs and generation timestamps,
evidence quotes and pinned source/policy hashes. The
index preparation step validates every variant with the normal answer/link
validator and seeds its citations into the server-only D1 cache. It makes no
OpenRouter or Pinecone calls. No time-based expiry or model warm-up is needed.
`CHAT_STARTER_CACHE_ENABLED=true` controls this shortcut.

Any referenced source-text change or relevant prompt/style change fails the
build until the corresponding starter copy is reviewed and its fingerprints
updated. Unrelated corpus changes produce a new namespace/cache key and the
still-valid reviewed answers are seeded again. Modified answer copy also changes
the keys. Do not blindly refresh fingerprints after a failed review check.
The cache uses the indexed corpus version, reviewed-copy digest, language,
persona, exact starter prompt and approved policy hash. Old keys cannot match.

Prepared replies store the actual model ID returned by OpenRouter for that
reviewed generation batch, including the resolved model behind a router. The
cache reader checks attribution against the reviewed manifest. The original generated batch keeps its pinned digest and model attribution.
Editorial wording changes have a separate review timestamp, revised-copy digest
and link to the original generation digest. Build validation checks that chain
and the current source/policy fingerprints. Editorial illustrations are also
stored separately and checked against cited page image evidence. Quick Take remains text-only. They retain
the normal model badge, Markdown, citation, copy, file-download, save and
continuation flows. Cache/schema failures use the live answer
flow without saving that unreviewed result as a starter. Questions with history
or attachments always use normal generation. The reviewed copy contains public
site/document facts only, without IPs, owner-background secrets, transcripts or
live citation counts. API responses remain private/no-store.

Consent, Turnstile, quota reservation and message persistence remain in the API
route before/after the answer service, so cached questions still count toward
all normal limits and save in the selected chat. Independent chat-title
creation remains unchanged and can still call the title model on a cache hit.
Cached answer streaming pauses 750 ms, then reveals groups of two or three words
at 110–140 ms intervals, with 220 ms sentence and 300 ms paragraph pauses,
through the same SSE protocol; nonstream requests have no
artificial delay. Citations and the verified generation-model attribution are preserved.

Fresh databases get `chat_starter_cache` from consolidated migration 0005. The
public index import also creates the table if absent for existing local
setups; it seeds the 40 validated replies without clearing chats or quotas.
Run the usual build
and `npm run chat:index:local` for localhost. Production needs the normal
migration/index import and deployment. Old version entries may remain stored,
but their keys cannot match the active reviewed-copy/content/policy version;
they are never served as current answers.

Reply images use Markdown and published site assets from the cited sources.
The index extracts visible images with alt text from static page content,
verifies the files exist, and stores their URLs separately in
`chat_source_images`. Runtime retrieval attaches this image evidence to each
source. No Pinecone re-embedding is needed for image metadata alone.

An answer may show up to two relevant, cited images. The renderer uses
responsive image cards with alt text and a link to the original; plain-text
copy includes the description and URL. Third-party images, API URLs and
invented asset paths are rejected. This supports published page images,
including diagrams and project artwork; it does not extract PDF figures or
provide visual understanding of image contents.

## LangSmith tracing

The backend uses the official LangSmith TypeScript client.
Each deployment has one `LANGSMITH_PROJECT`: `mpalaourg-chat-development` for
local development and previews, or `mpalaourg-chat-production` for production.
Wrangler configures the appropriate value in each environment. If omitted, the
project name defaults to `mpalaourg-chat-${CHAT_ENVIRONMENT}`, with missing or
invalid environment settings selecting development. The request hostname is not
used. Project names are public configuration, while `LANGSMITH_API_KEY` is a server-only secret. Use separate
tracing-only keys for development (`.env`) and production (Pages secrets).
These keys can share Workspace 1; descriptions do not create projects.

The newer LangSmith UI starts at Tracing → Connect an agent. You can avoid
manual onboarding by running `npm run chat:tracing:setup`: it submits one
synthetic, `setup-check`-tagged trace to each named project and creates them on
first ingestion when the key permits it. This setup uses the local workspace
key; normal production requests use the separate production key in Pages.
Keep projects private in that workspace.
The US endpoint is `https://api.smith.langchain.com`; EU accounts must instead
configure `https://eu.api.smith.langchain.com`. Unsupported endpoints fail closed
for telemetry, preventing credential forwarding to arbitrary hosts. Optionally
set `LANGSMITH_WORKSPACE_ID` if the key has no default workspace.

One completed request creates one root trace, using the message UUID as its
trace ID. Every child span carries the same thread ID, so messages appear in
LangSmith Threads. An answer-pipeline span separates reply latency from concurrent background title
work. Nested spans include cache eligibility/lookup and paced replay, decision
attempts with routing probabilities, planning and answer-model attempts, evidence
retrieval, dense and BM25 search results/scores, RRF ordering, optional model
reranking scores or skip reasons, image metadata, D1 fallback/search and reply
persistence. Title generation records its question and generated title.
Step I/O contains the current question, safe validated reply/plan, public source
metadata, counts and rankings; raw hidden prompts and source bodies are excluded. First visible-answer timing, actual
returned model, source URLs and available provider token/cost usage are recorded.
Costs are not invented where the provider supplies no usage. Cached answers
have a cache span and recorded model attribution, not a fictitious generation;
a separate title call may still consume tokens.

`LANGSMITH_TRACING=true` and a configured key enable export. Without a key,
tracing is inactive. `LANGSMITH_CAPTURE_CONTENT=true` records only the current
question and final answer; set it to `false` for metadata/timing-only traces.
There is basic credential and email redaction, not comprehensive PII detection.
System prompts, provider envelopes, previous history, retrieved document bodies,
owner-background records, IPs, browser ownership, cookies and headers are never
exported. Existing logs continue to avoid transcript content. The cookie notice
mentions diagnostic question/answer logging in both languages. Deleting browser
chat history removes D1 chat history; exported diagnostic records are separate
and follow the LangSmith project's access/retention settings.

Progress is exported through Cloudflare `waitUntil` at request start and again
when the answer is persisted. The root ends when the reply is saved, measuring answer latency rather than
background title latency. A final snapshot updates the completed title/background
spans and records `background_completed_ms`, without extending the answer root. Already-published run IDs are patched, not recreated, so a
slow title cannot hide an answered message or create duplicate traces. Exports
use bounded SDK batches, retries disabled and a three-second deadline covering SDK loading and ingestion, as well as a three-second HTTP timeout. LangSmith is a soft runtime dependency, loaded only when tracing is enabled. All instrumentation and nested span operations are best-effort. Serialization, SDK, logging and background-scheduling failures are swallowed. The first failed export disables further exports for that request. Requests never await telemetry, including when no Cloudflare background context is available; those runtimes may drop pending telemetry at shutdown. Provider/decision validation failures and fallback attempts are marked as failed
child runs. Terminal provider/storage errors carry a failed root, stage, safe
category and HTTP status. Operational failures before message reservation use
a metadata-only diagnostic, without unvalidated questions or thread ownership
data. Expected consent, validation, quota rejections and duplicate retries do not
create billable message traces. Failed spans and root requests include bounded application stack frames and
chained causes in LangSmith’s error field. The traceback uses the classified
failure label, error type and code locations. Exception messages, source snippets,
URL queries and local home-directory prefixes are excluded to protect generated
content, SQL values, credentials and visitor data. Existing failure labels and
HTTP statuses remain separate fields, including when a later fallback succeeds.
Trace-export errors log only safe project/trace
identifiers and status, never response bodies or credentials. Trace errors never
fail an answer or consume its model retry budget. There is no ingestion from unauthorized, rejected or duplicate requests.
Each request has its own client/buffer so simultaneous chats cannot mix state.

`LANGSMITH_SAMPLE_RATE` accepts 0–1, defaulting to 1. Each deployment configures
its own value. Zero disables tracing in that deployment. The two projects
share the workspace/account allowance; they do not each receive a free quota.
The Developer plan currently includes 5,000 base traces/month. At 200 questions
every day, full tracing can exceed that allowance. Set the workspace's total
trace limit to 5,000 in LangSmith's usage settings to prevent overage, or lower
production sampling (for example, 0.5). Reaching a tracing limit stops telemetry,
not the chatbot. No paid plan or extended-retention setting is enabled by code.

After adding the local key, run `npm run chat:tracing:check`. It sends only a
synthetic development trace, with no model call, real conversation, or chat usage.
A successful ingestion response confirms acceptance; inspect the project UI to
confirm the trace is indexed. Production still requires normal deployment and
its own key in Cloudflare secrets. No LangSmith account/project is provisioned
by a site build, and builds make no tracing network calls.

For a deeper live check, `npm run chat:tracing:check -- --cached` exercises the
real reviewed-answer path in an in-memory index, including paced replay and
progress patches. If OpenRouter is configured it also generates one real
background title. This is tagged `setup-check`, does not touch visitor history
or allowance, and logs neither credentials nor full transcripts to the terminal.

`npm run chat:tracing:check -- --cached --no-title` verifies cache-only progress
updates without any model call. `npm run chat:tracing:check -- --error` sends an
explicitly synthetic failed trace to verify error visibility; it does not call
a failing provider or change chat history/allowance.

### Retrieval environment isolation

Pinecone development and production use separate physical indexes, declared in
`infra/pinecone/chat-index.json`. Every Wrangler deployment block supplies a
single `PINECONE_INDEX_HOST`, `LANGSMITH_PROJECT` and `LANGSMITH_SAMPLE_RATE`
for its environment. Local/preview use the development index and tracing project;
production uses its own index and project. `CHAT_ENVIRONMENT` labels traces and
supplies the default project name when none is configured. No domain list chooses
resources, and the runtime never substitutes a different deployment's host.
Missing Pinecone configuration uses D1 keyword search. Reranking is explicitly
disabled in development configuration and enabled in production, with no hidden
runtime override. IaC defaults to development; production commands require
`--environment production`. Remote D1 maintenance uses `--env production`;
local maintenance uses `--local`. Preview chat is disabled until a separate D1
binding, migrations and matching development corpus are configured.
See `docs/chat-pinecone.md` for release order and local overrides.

### Questions about the assistant itself

The published site-assistant article is factual evidence for questions about its
architecture, stack, retrieval, citations, response styles, fallbacks, privacy
controls and tracing. Routing explicitly distinguishes these substantive
questions from a brief “What can I ask you?” capabilities exchange. Explaining
public implementation documentation is allowed; extracting hidden prompts,
private settings or credentials remains forbidden. This is prompt-based routing,
not a keyword bypass. The ordinary planner, retrieval and citation checks apply.

### Routing catalog coverage

Intent classification receives the bounded public source catalog (up to 200
titles and URLs), separately from explicit source attachments. This lets it
recognize questions covered by championship archives and other indexed pages.
Catalog entries identify topic coverage; factual replies still require retrieved
evidence. Mixed requests and prompt extraction remain subject to the same scope
checks. Retrieval plans can omit unused selectors; present selectors retain
their type, size, URL allowlist and attachment-boundary checks.

Model-attempt warnings include the `stage` and classified `validation` reason,
such as `unexpected_retrieval`, alongside provider status and timing. They exclude
questions, prompts, provider bodies and credentials.
