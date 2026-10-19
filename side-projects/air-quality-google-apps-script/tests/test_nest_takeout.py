import importlib.util
from pathlib import Path
import unittest
p=Path(__file__).resolve().parents[1]/'scripts/nest_takeout_import.py'
s=importlib.util.spec_from_file_location('nest_takeout',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ImportTests(unittest.TestCase):
 def row(self):
  r={'interval_start':'2026-10-14T20:00:00Z','interval_end':'2026-10-14T20:15:00Z','heating_time':300,'cooling_time':0,'heat_mode_time':900,'cool_mode_time':0,'heatcool_mode_time':0,'off_mode_time':0}
  r.update({k:0 for k in ('alt_heat1_time','alt_heat2_time','aux_heat_time','emergency_heat_time')});return r
 def test_units_and_unknown(self):
  r=self.row();self.assertEqual(m.validate(r)['heating_minutes'],5);self.assertEqual(m.validate(r)['off_minutes'],10)
  r['heat_mode_time']=904;self.assertEqual(m.validate(r)['coverage_seconds'],0)
  r['heat_mode_time']=850;self.assertEqual(m.validate(r)['coverage_seconds'],0);self.assertIsNone(m.validate(r)['off_minutes'])
 def test_invalid_counter_and_boundary(self):
  r=self.row();r['heating_time']=None
  with self.assertRaises(ValueError):m.validate(r)
  r=self.row();r['interval_end']='2026-10-14T20:16:00Z'
  with self.assertRaises(ValueError):m.validate(r)
 def test_csv_wrapped_json(self):
  import csv,io,json
  f=io.StringIO();csv.writer(f).writerow([json.dumps(self.row())]);self.assertEqual(m.decode_line(f.getvalue()),self.row())
 def test_deterministic_build_and_dst(self):
  import tempfile,zipfile,json
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'export.zip';a=self.row();a.update(device_id='one',interval_start='2026-11-01T07:45:00Z',interval_end='2026-11-01T08:00:00Z')
   b=dict(a,interval_start='2026-11-01T08:00:00Z',interval_end='2026-11-01T08:15:00Z')
   with zipfile.ZipFile(p,'w') as z:z.writestr('thermostat/2026/11/HvacRuntime.jsonl','\n'.join(json.dumps(r) for r in [a,b]))
   args=(p,'2026-11-01T00:00:00Z','sdm-one','whole_house','2026-11-02T00:00:00Z');r=m.build(*args)
   self.assertEqual(r,m.build(*args));self.assertEqual(len({v['bin_zone_key'] for v in r['bins']}),2)
   self.assertTrue(r['bins'][0]['timestamp_local'].endswith('-06:00'));self.assertTrue(r['bins'][1]['timestamp_local'].endswith('-07:00'))
   self.assertNotIn('hvac_status',r['bins'][0]);self.assertNotIn('fan_timer_state',r['bins'][0])
if __name__=='__main__':unittest.main()
