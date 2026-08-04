from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
version=(root/'VERSION').read_text(encoding='utf-8').strip()
required=['index.html','marketplace.html','smart-board.html','most-added.html','won-codes.html','performance.html','sources.html','login.html','admin-login.html','admin-users.html','privacy.html','account.html','saved.html','styles.css','responsive.css','src/mvp.js','src/intelligence.js','src/stability.js','src/control-room.js','src/auth.js','src/login.js','src/admin-login.js','src/admin-users.js','src/saved.js','src/account.js','src/saved-page.js','src/experience.js','src/handoff.js','control-room.html','data/feed-health.json','data/manual-overrides.json','scripts/codehub-normalizer.mjs','scripts/intelligence-history.mjs','render.yaml','manifest.json','assets/logo-mark.png','assets/logo-wordmark-dark.png','assets/logo-wordmark-light.png','assets/logo-mark.webp','assets/logo-wordmark-dark.webp','assets/logo-wordmark-light.webp','data/tip-history.json','data/source-stats.json','data/performance-summary.json','supabase/migrations/002_auth_presence_admin.sql','supabase/migrations/003_official_admin_lockdown.sql','supabase/migrations/004_user_utility_admin_controls.sql','supabase/migrations/005_remove_member_location_data.sql']
missing=[p for p in required if not (root/p).exists()]
assert not missing, missing
for page in ['index.html','marketplace.html','smart-board.html','most-added.html','won-codes.html','performance.html','sources.html']:
    text=(root/page).read_text(encoding='utf-8')
    assert f'/src/mvp.js?v={version}' in text,page
    assert f'/src/intelligence.js?v={version}' in text,page
    assert '/assets/logo-wordmark-dark.webp' in text,page
    assert f'/src/stability.js?v={version}' in text,page
    assert f'/src/auth.js?v={version}' in text,page
    assert f'/src/saved.js?v={version}' in text,page
    assert 'data-auth-link' in text,page
    assert f'/responsive.css?v={version}' in text,page
    assert f'/src/experience.js?v={version}' in text,page
    assert f'/src/handoff.js?v={version}' in text,page
    # Strip tags and inspect only user-visible copy for implementation names.
    visible=re.sub(r'<script[\s\S]*?</script>','',text,flags=re.I)
    visible=re.sub(r'<[^>]+>',' ',visible)
    lowered=visible.lower()
    for forbidden in ['supabase','render.com','github','service_role']:
        assert forbidden not in lowered,(page,forbidden)
market=(root/'marketplace.html').read_text()
board=(root/'smart-board.html').read_text()
tips=(root/'most-added.html').read_text()
assert 'id="codeDay"' in market
assert 'id="smartBoard"' in board
assert 'id="contradictionGrid"' in board
assert 'id="tipDay"' in tips
assert 'class="tip-groups"' in tips
login=(root/'login.html').read_text()
assert 'Continue with Google' in login
assert 'Share a broad area' not in login
admin=(root/'admin-users.html').read_text()
assert 'Online now' in admin or 'Users and live presence' in admin
manifest=json.loads((root/'manifest.json').read_text())
assert manifest['name'].startswith('sporty.codes')
assert any(x['url'].startswith('/smart-board') for x in manifest['shortcuts'])
render=(root/'render.yaml').read_text()
server=(root/'server/index.mjs').read_text()
assert 'runtime: node' in render
assert 'startCommand: node server/index.mjs' in render
for route in ['/smart-board','/control-room','/login','/admin-login','/admin-users','/privacy','/account','/saved']:
    assert f"'{route}'" in server,route
print('Tip Intelligence account and presence MVP validation passed')
