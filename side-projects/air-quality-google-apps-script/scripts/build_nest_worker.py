"""Build a separate Apps Script project; never push worker files to the bound collector."""
from pathlib import Path
import shutil

base = Path(__file__).resolve().parents[1]
output = base / 'tmp/nest-worker'
output.mkdir(parents=True, exist_ok=True)
shutil.copyfile(base / 'src/18_NestCore.js', output / 'Core.js')
for name in ['Code.js', 'appsscript.json']:
    shutil.copyfile(base / 'nest-worker' / name, output / name)
print('Built separate worker in tmp/nest-worker; configure its own .clasp.json before deployment.')
