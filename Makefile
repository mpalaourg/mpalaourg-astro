.PHONY: run

run:
	npm run build && npx wrangler pages dev ./dist --compatibility-date=2026-03-03 --port=8788
