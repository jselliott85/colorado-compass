import importlib.util
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "fetch_outdoor_aqi.py"
SPEC = importlib.util.spec_from_file_location("fetch_outdoor_aqi", MODULE_PATH)
outdoor = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = outdoor
SPEC.loader.exec_module(outdoor)


class OutdoorAQTests(unittest.TestCase):
    def test_parse_parameter_page_finds_site_column_and_preserves_blanks(self):
        page = """
        <div id="divSummaryData"><p>Hourly averages in &micro;g/m3 for 09/20/2026</p>
        <td onclick="table_highlight('cell', 'col', 6);">BOU</td>
        """ + "".join(
            f'<td id="cell{hour}-6" class="cell">'
            + ("<br />2<br />12" if hour == 24 else f"{hour}<br /><b>2</b><br />13")
            + "</td>"
            for hour in range(1, 25)
        )
        source_date, rows = outdoor.parse_parameter_page(page, outdoor.PARAMETERS[0])
        self.assertEqual(source_date, date(2026, 9, 20))
        self.assertEqual(len(rows), 24)
        self.assertEqual(rows[0]["outdoor_pm25_1h_ug_m3"], "1")
        self.assertEqual(rows[-1]["outdoor_pm25_1h_ug_m3"], "")
        self.assertEqual(rows[-1]["hour_ending"].date(), date(2026, 9, 21))

    def test_hour_ending_is_expanded_to_prior_four_quarters(self):
        ending = datetime(2026, 9, 20, 1, tzinfo=outdoor.MST)
        records = {}
        for parameter in outdoor.PARAMETERS:
            values = {field: "10" for field in parameter.value_fields}
            records[(ending, parameter.slug)] = values
        rows = outdoor.combine_hourly(
            records, date(2026, 9, 20), date(2026, 9, 20), "America/Denver"
        )
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0]["timestamp_local"], "2026-09-20T01:00:00-06:00")
        self.assertEqual(rows[-1]["timestamp_local"], "2026-09-20T01:45:00-06:00")
        self.assertEqual(rows[0]["outdoor_combined_aqi"], "10")

    def test_fixed_mst_is_one_hour_behind_mdt(self):
        mst = datetime(2026, 9, 20, 1, tzinfo=timezone(timedelta(hours=-7)))
        denver = mst.astimezone(outdoor.ZoneInfo("America/Denver"))
        self.assertEqual(denver.isoformat(), "2026-09-20T02:00:00-06:00")


if __name__ == "__main__":
    unittest.main()
