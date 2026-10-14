const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'src')).filter((name) => name.endsWith('.js'));
const source = files.map((name) => fs.readFileSync(path.join(root, 'src', name), 'utf8')).join('\n');

assert.equal(/25\s+Palamino/i.test(source), false, 'home address must not be in source');
assert.equal(/jselliott85@gmail\.com/i.test(source), false, 'personal email must not be in source');
assert.equal(/john@leehilllabs\.com/i.test(source), false, 'account email must not be in source');
assert.equal(/wind/i.test(fs.readFileSync(path.join(root, 'src/12_Tempest.js'), 'utf8').replace(/Wind is excluded\./i, '')), false, 'Tempest wind must remain excluded');
assert.equal(/tempest_wind/.test(source), false);
assert.match(source, /WU_API_KEY/);
assert.equal(/apiKey=[a-f0-9]{20,}/i.test(source), false, 'no embedded WU client key');
assert.match(source, /DYSON_INGEST_SECRET/);
assert.match(source, /TEMPEST_TOKEN/);
assert.equal(/DYSON_TOKEN/.test(source), false, 'Dyson bearer token belongs only in GitHub Actions secrets');
assert.equal(/TEMPEST_TOKEN\s*[:=]\s*['"][^'"]+['"]/.test(source), false, 'no Tempest token literal');

console.log('Static security/schema checks passed.');
