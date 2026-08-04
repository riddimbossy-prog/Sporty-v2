from html.parser import HTMLParser
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]

class RefParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='script' and attrs.get('src'): self.refs.append(attrs['src'])
        if tag=='link' and attrs.get('href'): self.refs.append(attrs['href'])

parser=RefParser()
parser.feed((ROOT/'index.html').read_text(encoding='utf-8'))
missing=[]
for ref in parser.refs:
    if ref.startswith(('http://','https://','//','#')): continue
    clean=ref.split('?',1)[0].lstrip('/')
    path=(ROOT/clean).resolve()
    if not path.exists(): missing.append(ref)
if missing:
    raise SystemExit(f'Missing local references: {missing}')

json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
banner=json.loads((ROOT/'data/codehub-banner.json').read_text(encoding='utf-8'))
if not isinstance(banner.get('items'), list):
    raise SystemExit('Code Hub banner JSON must contain an items array')
if banner.get('count') != len(banner.get('items', [])):
    raise SystemExit('Code Hub banner count does not match items')

for filename in ['src/app.js','src/backend.js','scripts/codehub-normalizer.mjs','scripts/sync-codehub.mjs']:
    text=(ROOT/filename).read_text(encoding='utf-8')
    if '.innerHTML' in text:
        raise SystemExit(f'Unsafe innerHTML found in {filename}')

sql=(ROOT/'supabase/migrations/001_marketplace.sql').read_text(encoding='utf-8')
for required in ['enable row level security','purchase_listing','reveal_listing_code','listing_secrets','for update']:
    if required not in sql.lower():
        raise SystemExit(f'SQL migration missing: {required}')

required_files=[
    '.github/workflows/validate.yml',
    'scripts/codehub-normalizer.mjs',
    'scripts/sync-codehub.mjs',
    'server/index.mjs',
    'supabase/migrations/007_custom_api.sql',
    'START_HERE.md'
]
missing_required=[name for name in required_files if not (ROOT/name).exists()]
if missing_required:
    raise SystemExit(f'Missing Code Hub integration files: {missing_required}')

print('static-build-validation: passed')
