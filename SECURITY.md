# Security rules

## Server-only values

Never place these in browser files or GitHub commits:

- `SUPABASE_SERVICE_ROLE_KEY`
- `API_FOOTBALL_KEY`
- `ODDS_API_KEY`
- `CUSTOM_API_ADMIN_TOKEN`

Store them only in Render environment settings.

## Browser-safe values

The Render build places these in generated `config.js`:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Row Level Security must remain enabled in Supabase.

## API controls

- Same-domain deployment
- Per-IP rate limiting
- Request-body size limit
- Upstream timeout
- Daily upstream request budget
- Memory and Supabase caching
- Request deduplication
- Bearer-token protection on administrator routes
- Security headers on API and static responses

## Platform boundary

Do not add code that bypasses login, CAPTCHA, access controls, private endpoints, or platform protections. Do not store user betting-account cookies or credentials.
