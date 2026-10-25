# Pinecone infrastructure and retrieval

The public corpus uses **Pinecone Starter**, with semantic and BM25 keyword
search on one document index. Both branches run in Pinecone and are fused locally
using reciprocal rank fusion (RRF, k=60). RRF has no inference fee and is always
enabled. After fusion, `bge-reranker-v2-m3` can reorder the candidates while its
free allowance remains. Cloudflare AI Search is not used.

## Infrastructure as code

`infra/pinecone/chat-index.json` declares the name, AWS `us-east-1` placement,
BM25 fields and `multilingual-e5-large` embedding configuration. It is the source
of truth for provisioning and corpus generation. The scripts pin the Documents
REST API to `2026-07`; no SDK dependency or Terraform state containing credentials
is needed. This is a small declarative manifest and reconciler, not a Terraform
provider. It deliberately implements no automatic destroy/replacement operation.

One-time prerequisite: create a Pinecone account/project on **Starter**, and save
a project API key in the ignored local `.env` as `PINECONE_API_KEY`. Do not upgrade
to a paid plan or enable a paid trial for this setup. The scripts authenticate
with this key, but never print it, copy it into generated files or change plans.

```sh
npm run chat:pinecone:plan
npm run chat:pinecone:apply
npm run chat:pinecone:configure
npm run build
npm run chat:pinecone:sync
npm run chat:pinecone:check
```

* `plan` is read-only. Without a key it describes the local desired resource;
  with a key it checks whether creation is needed and detects schema drift.
* `apply` creates a missing index, waits for readiness and validates an existing
  schema. It never replaces/deletes an index. Schema drift fails with a clear
  message; the provider cannot migrate a document schema in place.
* `sync` uploads reviewed public content only, in bounded batches. It uses stable
  record IDs and a local ignored checkpoint, so completed batches are skipped on
  reruns. There are no blind network retries. An ambiguous failed batch can be
  repeated safely, but its embeddings may be metered twice.
* `check` performs a small BM25 readiness query against the current namespace.

Development and production use **different physical indexes**, declared under
`environments` in the manifest:

* Development: `mpalaourg-chat-development`.
* Production: `mpalaourg-chat` (the existing production index).

All IaC commands default to **development**. Production requires an explicit
`--environment production`, for example:

```sh
npm run chat:pinecone:plan -- --environment production
npm run chat:pinecone:apply -- --environment production
```

`apply` writes `.chat/pinecone-connection-development.json` or
`.chat/pinecone-connection-production.json`. Upload checkpoints are scoped by
index host and content namespace, so uploading one environment never marks the
other complete. Both indexes use the same schema and versioned corpus artifacts.

`configure` consumes the output for the selected environment and writes that
host to the corresponding deployment blocks in `wrangler.jsonc`. Every deployment
has one `PINECONE_INDEX_HOST`. Development updates local and preview configuration;
production updates only the production block and pipes the key directly to
Wrangler to update the Pages production secret. It requires Wrangler login and
does not print the key, write it to generated files or deploy the application.
It refuses to configure the same host for both environments. IaC resolves the
selected index from the manifest and Pinecone control plane, independently of
any local runtime host override.

`wrangler.jsonc` configures local and Pages preview with
`CHAT_ENVIRONMENT=development`, and Pages production with
`CHAT_ENVIRONMENT=production`. Each block contains only its own Pinecone host,
LangSmith project and `LANGSMITH_SAMPLE_RATE`. Missing or invalid environment
labels default to development for trace metadata and default project naming;
they do not rewrite an explicitly configured host or project. The request hostname
does not choose resources. A missing host uses D1 keyword search.

Wrangler vars are non-inheritable, so both Pages environment blocks list their
vars explicitly. Reranking is explicitly disabled in local/preview configuration
and enabled in production; the runtime honors `PINECONE_RERANK_ENABLED` without
an environment-dependent override. Local `.env` or `.dev.vars` values override
Wrangler vars: use a development host and key there, with `LANGSMITH_PROJECT`
and `LANGSMITH_SAMPLE_RATE`, without the old environment suffixes. Restart the
local server after changing environment configuration.

Local Wrangler D1 is stored separately from remote production D1. The production
Pages block binds the existing production database. The preview block deliberately
has no D1 binding and sets `CHAT_ENABLED=false` until a separate preview database
is configured: chat remains unavailable there rather than accessing production
history or usage counters. When adding that binding, apply migrations and import
the matching development corpus before enabling preview chat.

## Reviewed corpus, without manual file uploads

The build prepares `.chat/pinecone.json` from exactly the same allowlisted pages
and reviewed PDF/PPTX extraction as the D1 corpus. This includes English/Greek
pages, Formula articles and guides, CVs, research documents and workshop slides.
It excludes archives, code, credentials, visitor transcripts and the private
owner-background module. No upload occurs during an ordinary build.

With both approved project articles: **89 sources**, **699 reviewed chunks**,
and **3,048 small embedding passages**. The larger reviewed chunks remain intact in
D1. To avoid silently clipping Greek/formula text at E5's 507-token input limit,
embedding passages are conservatively bounded to 440 UTF-8 bytes, with small
overlap and `truncate: NONE`. BM25 also indexes each passage and its title.

Every child record identifies its parent chunk by a SHA-256 ID. Remote text,
titles and URLs are never accepted as answer evidence. Returned IDs resolve
through `chat_pinecone_chunks` to the reviewed D1 text and original citation URL.
This D1 lookup is materialization, not a second keyword search.

Each content version has an immutable namespace `site-<24 hex characters>`.
Runtime obtains the namespace from D1's active `chat_index_meta.version`. Upload
the new namespace completely and allow indexing to finish **before** activating
the matching D1 index. Thus partial uploads and old content never silently mix.
Old namespaces are not automatically deleted. Monitor Starter storage/namespace
limits and deliberately remove retired public snapshots through Pinecone when
appropriate. No database or private history is deleted by this implementation.

## Metadata and how retrieval uses it

Every embedding passage now carries metadata version 2:

* **Identity:** canonical URL/source ID groups translated versions; document ID
  connects a publication page, its primary PDF and presentation while retaining
  separate source IDs. CV translations share canonical identity too.
* **Content:** explicit source type, format, content language and topics. File
  classifications live in the reviewed document catalog; page types follow the
  site's routes. Published JSON-LD supplies DOI/authors and publication dates
  where present. Related PDFs/slides inherit DOI/authors as work identity, with
  the work's date labeled `work_published_at`, never as the slide's own date.
* **Location:** actual editorial/Markdown section headings, page/slide number,
  source chunk index/count and passage index/count. Pages whose extraction has
  no heading retain an empty heading list; missing dates stay absent.
* **Context and provenance:** adjacent parent IDs, source and chunk checksums,
  extraction method, corpus version, document section count, season where
  explicitly identified by the route, and detected textual table/math flags.

Only searchable title/body fields belong in the index schema. These additional
Pinecone document fields are automatically stored/indexed as metadata, so the
existing index can accept them without replacement. See Pinecone's
[Documents API explanation](https://www.pinecone.io/learn/pinecone-documents-api/).
A metadata edit changes the corpus version and parent IDs; checkpointing cannot
silently skip records with outdated metadata.

The planner receives compact reviewed metadata alongside catalog URLs, allowing
it to select guides rather than season reviews and primary PDFs rather than
summaries. Its selected URLs constrain **both** Pinecone branches. Reranking
receives bounded type/language/section context. Returned evidence includes
validated metadata from D1 for the answering model; remote metadata/text is
never trusted as evidence. General retrieval chooses one localized version per
canonical source, without excluding English primary PDFs from Greek questions.
Explicit attachments preserve the selected scope. Neighbor IDs are recorded for
traceability and future bounded context expansion; no unscored neighbor expansion
is currently performed. Topic/type metadata is not automatically BM25 text;
BM25 still ranks title/body, and no keyword-based intent router was added.

The public import creates/repopulates `chat_pinecone_metadata`, so an existing
local database that already applied migration 0005 does not need that migration
replayed. No history or quota table is modified. Fresh databases get this table
from migration 0005. Upload the new namespace fully before importing its matching
D1 corpus. The normal production release is still required to activate it.

## Production configuration and release order

In **Cloudflare Pages > project > Settings > Variables and secrets > Production**:

* Add `PINECONE_API_KEY` as a **secret**, with access to this Pinecone project,
  or run `npm run chat:pinecone:configure -- --environment production` to do this programmatically.
* Keep `PINECONE_INDEX_HOST` as a **text variable** in `wrangler.jsonc`.
* `PINECONE_ENABLED=true` and `PINECONE_RERANK_ENABLED=true` are already declared.

Public Pages runtime settings can be planned and applied from `wrangler.jsonc`:

```sh
npm run chat:pages:configure -- --environment production
npm run chat:pages:configure -- --environment production --apply
npm run chat:pages:configure -- --environment preview --apply
```

This uses the existing Wrangler login, patches only public variables, verifies
them and checks that existing secret bindings remain present. It never submits
secret values or triggers a deployment. Preview remains disabled until it has
its own database and credentials. `--apply` is required to change remote settings.

For initial release or a content update:

```sh
npm run build
npm run chat:pinecone:sync -- --environment production
# Allow indexing to complete, then:
npm run chat:pinecone:check -- --environment production
npm run db:migrate:production
npm run chat:index:remote
```

Then deploy the application through the normal release flow. Remote D1 commands
are deliberate production operations, never automatic build hooks. Migration
`0005_chat_pinecone.sql` only adds a parent-ID mapping and persistent monthly
reranking counter. Reindexing replaces public knowledge and the ID map; it never
clears histories, visitor allowances or the reranking budget.

For localhost, run `npm run db:migrate:local` and `npm run chat:index:local`
after building, and restart the local server after updating environment settings.
Local requests use the separate development Pinecone index. Model reranking is
disabled in development configuration because local D1 counters are independent
of production, while provider allowances can be shared. It can be explicitly
enabled for a deliberate reranking test. Public production hosts use the same
production deployment configuration and D1 rerank budget.

## Retrieval settings

These non-secret variables are declared near the top of `wrangler.jsonc` and can
be overridden in local environment configuration:

| Setting | Default | Accepted range | Meaning |
| --- | --- | --- | --- |
| `PINECONE_TOP_K` | 40 | 1–100 | Child passages returned by **each** Pinecone branch |
| `PINECONE_RERANK_CANDIDATES` | 24 | 1–100 | Unique reviewed parent chunks retained after RRF, before optional model reranking |
| `CHAT_CONTEXT_TOP_K` | 8 | 1–24 | Maximum general-search chunks sent to the answer model, also used by the D1 fallback |

Invalid values use defaults. These are server configuration, never visitor input.
The two branches may return up to 80 passages combined at the defaults; duplicates
are grouped by parent before selecting 24 candidates. RRF's rank constant is 60,
which is unrelated to `top_k`. General context retains at most two chunks per
canonical source URL. Explicit tags/planner-selected documents instead share the
24,000-character context budget across selected sources, so detailed document
questions are not limited to eight chunks. The character budget always applies.
Increasing candidate counts can increase search work, reranking input and answer
context size; it does not increase the 500-request monthly reranking allowance.

### Live bilingual checks, 23 October 2026

Twelve distinct public queries covered workshop workflows/agents, concentrated
attention research, career/customer-feedback work, and Formula scoring in both
languages. A thirteenth diagnostic request inspected a weak Formula result.
Both branches and actual `bge-reranker-v2-m3` calls succeeded; none used D1 FTS.
The twelve-query set took roughly 0.95–2.72 seconds per retrieval including
reranking. These were direct retrieval checks, not end-to-end answer/planner tests.

* Workshop and career queries ranked the appropriate localized pages/CVs first.
* Research queries found the concentrated-attention publication in both languages;
  English method/evaluation queries also promoted relevant PDF technical pages.
  Greek technical queries favored translated summaries more strongly, so finding
  the right paper is not a guarantee of complete technical evidence.
* Precise Grand Prix/Sprint scoring questions ranked the correct English/Greek
  racecraft guide first. Broad “drivers and constructors championship points”
  questions instead promoted season reviews above that guide. The correct guide
  was a candidate, but model reranking did not resolve the ambiguity.

These observations do not establish perfect relevance. The evidence planner's
focused queries and catalog/attachment filters remain important, particularly for
technical PDF details and broad Formula questions. Reranker scores are relevance
signals, not calibrated probabilities or guarantees of factual answer quality.

### Metadata verification, 23 October 2026

All 2,877 enriched passages were uploaded to a new namespace on the existing
index. Every generated record passed runtime metadata validation. Live compound
filters correctly selected an English primary paper by work ID, a Greek guide,
and a 2021 season review. A search constrained to the last uploaded parent also
confirmed that its new metadata was searchable.

Eight additional English/Greek retrieval checks exercised both branches and
actual reranking, with no D1 keyword fallback. Workshop, career and research
queries retained the expected evidence, and duplicate page-language versions
were removed from general context. The broad Greek championship-points query
now ranked the racecraft guide first. The English equivalent still favored
season reviews, so the additional metadata is useful but does not establish that
all ranking ambiguities are solved. These are retrieval checks, not end-to-end
planner/answer quality measurements. Local public D1 knowledge/metadata was
refreshed without changing histories or daily allowances; production activation
still requires the normal application release and matching D1 import.

## Failure and budget behavior

* Each factual retrieval sends two Pinecone search calls: dense semantic and
  BM25 plain-text scoring. It never interpolates Lucene syntax or SQL from a
  question. Both branches receive the same server-validated `@`/planner URL
  filters, which are checked again when resolving evidence locally.
* Successful hybrid results, including successful **empty** results, never run
  D1 keyword matching. Owner-approved background facts remain separately scoped
  as before. The same context-size limits and citation validation still apply.
* Missing configuration, invalid host, HTTP errors, timeouts, schema/index
  mismatch or malformed search results trigger the existing **D1 keyword-only
  fallback**. Either failed branch means hybrid retrieval failed. Requests are
  bounded to an eight-second retrieval timeout and a shared 12-second budget.
* Reranking reserves a slot with one atomic D1 write before calling Pinecone.
  It allows at most **500 attempts per UTC month**, including failures/timeouts.
  It does not count as one of the visitor's questions. Deleting history and
  reindexing cannot reset it. Any rerank 429 conservatively blocks further model
  reranking that month. Missing counter schema or other rerank failures also
  skip reranking. The fused Pinecone results remain; D1 fallback is not triggered.
* The reranking cap applies to this production application's calls, not the
  whole Pinecone account. Dashboard/direct tests and other applications consume
  the provider allowance independently. Starter rejects over-limit requests;
  staying on Starter is the billing protection. OpenRouter remains separately
  billed under its own key spending cap. Do not turn on paid fallback rerankers.
* `chat_pinecone_fallback` emits only a fixed reason/status; rerank failures emit
  `chat_pinecone_rerank_skipped`. No provider bodies, API keys, questions, private
  history or raw database errors are logged.

Inspect the production application counter without resetting it:

```sh
npx wrangler d1 execute mpalaourg-site-cache --remote --env production --command "SELECT month,reranks,blocked FROM chat_pinecone_usage ORDER BY month DESC LIMIT 6"
```

References: [Documents API and BM25](https://docs.pinecone.io/guides/search/full-text-search),
[integrated embeddings](https://docs.pinecone.io/guides/search/integrated-embedding),
[hybrid search](https://docs.pinecone.io/guides/search/hybrid-search),
[free-plan limits](https://docs.pinecone.io/reference/api/database-limits/rate-limits).

## Approving the site-assistant project article

Both `/projects/site-assistant/` and `/el/projects/site-assistant/` are approved
for ingestion. The normal build includes their article text, section headings,
metadata and published figures. Build output alone does not activate a remote
corpus: sync and check the intended environment, then import the matching D1
artifact. The article-only Git commit does not include or deploy the chatbot
backend. Production D1 activation belongs to the chatbot release.
