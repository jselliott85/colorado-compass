"""Synthetic sync tests: no Keychain, Google authorization or external I/O."""
import copy
from datetime import datetime, date, timezone
import unittest

import garmin_sync as s


class FakeSheet:
    def __init__(self, entries=None, failure=None):
        self.entries = entries or []
        self.failure = failure
        self.writes = 0
        self.reads = 0

    def read(self):
        self.reads += 1
        return copy.deepcopy(self.entries), {n for n, _ in self.entries}

    def write(self, n, row):
        self.writes += 1
        if self.failure == "before":
            raise s.SyncError("transport")
        self.entries = [(i, r) for i, r in self.entries if i != n] + [(n, copy.deepcopy(row))]
        if self.failure == "mismatch":
            self.entries[-1][1]["weight_kg"] += 1
        if self.failure == "bad_revision":
            self.entries[-1][1]["revision"] += 1
        if self.failure == "after":
            raise s.SyncError("transport")


class SyncTests(unittest.TestCase):
    now = datetime(2026, 10, 26, 19, tzinfo=timezone.utc)
    start, end = date(2026, 10, 20), date(2026, 10, 26)

    def raw(self, identifier=123, timestamp=1793016000000):
        return {"samplePk": identifier, "sourceType": "INDEX_SCALE", "timestampGMT": timestamp, "weight": 75000,
                "bodyFat": 20, "bodyWater": None, "muscleMass": 30000, "boneMass": 3000, "bmi": 24}

    def run_sync(self, sheet, records, **kwargs):
        return s.synchronize(sheet, records, self.start, self.end, self.now, **kwargs)

    def test_seven_calendar_days_and_dst(self):
        for instant, expected in [("2026-11-01T06:30:00+00:00", date(2026, 11, 1)),
                                  ("2026-11-01T05:30:00+00:00", date(2026, 10, 31)),
                                  ("2027-03-14T09:30:00+00:00", date(2027, 3, 14))]:
            start, end = s.lookback_window(datetime.fromisoformat(instant))
            self.assertEqual(end, expected)
            self.assertEqual((end - start).days, 6)
        for day, hour in [(date(2026, 10, 31), 17), (date(2026, 11, 1), 18),
                          (date(2027, 3, 13), 18), (date(2027, 3, 14), 17)]:
            scheduled = datetime(day.year, day.month, day.day, 11, 45, tzinfo=s.DENVER).astimezone(timezone.utc)
            self.assertEqual((scheduled.hour, scheduled.minute), (hour, 45))

    def test_insert_readback_and_duplicate_rerun(self):
        sheet = FakeSheet()
        self.assertEqual(self.run_sync(sheet, [self.raw()])["inserted"], 1)
        original = copy.deepcopy(sheet.entries)
        self.assertEqual(self.run_sync(sheet, [self.raw()])["noop"], 1)
        self.assertEqual(sheet.writes, 1)
        self.assertEqual(sheet.entries, original)
        self.assertGreaterEqual(sheet.reads, 6)

    def test_lost_response_after_persistence_never_reappends(self):
        sheet = FakeSheet(failure="after")
        self.assertEqual(self.run_sync(sheet, [self.raw()])["inserted"], 1)
        self.assertEqual(len(sheet.entries), 1)
        self.run_sync(sheet, [self.raw()])
        self.assertEqual(sheet.writes, 1)

    def test_lost_response_before_persistence_fails_for_reconciliation(self):
        sheet = FakeSheet(failure="before")
        with self.assertRaises(s.SyncError):
            self.run_sync(sheet, [self.raw()])
        self.assertEqual(sheet.writes, 1)
        self.assertEqual(sheet.entries, [])
        sheet.failure = None
        self.run_sync(sheet, [self.raw()])
        self.assertEqual(len(sheet.entries), 1)

    def test_readback_mismatch_stops(self):
        for failure in ("mismatch", "bad_revision"):
            with self.assertRaises(s.SyncError):
                self.run_sync(FakeSheet(failure=failure), [self.raw()])

    def test_unknown_id_rejected_and_duplicate_provider_rows_collapse(self):
        with self.assertRaises(s.SyncError):
            self.run_sync(FakeSheet(), [self.raw(None)])
        sheet = FakeSheet()
        self.run_sync(sheet, [self.raw(), self.raw()])
        self.assertEqual(sheet.writes, 1)

    def test_changed_source_never_overwrites(self):
        sheet = FakeSheet()
        self.run_sync(sheet, [self.raw()])
        changed = dict(self.raw(), weight=76000)
        with self.assertRaises(s.SyncError):
            self.run_sync(sheet, [changed])
        self.assertEqual(sheet.writes, 1)

    def test_explicit_validation_write_preserves_existing_metadata(self):
        sheet = FakeSheet()
        self.run_sync(sheet, [self.raw()])
        old = copy.deepcopy(sheet.entries)
        result = self.run_sync(sheet, [self.raw()], verify_existing_write=True)
        self.assertEqual(result["verified_writes"], 1)
        self.assertEqual(sheet.entries, old)

    def test_empty_and_outside_window_are_not_zero_measurements(self):
        sheet = FakeSheet()
        self.assertEqual(self.run_sync(sheet, [self.raw(timestamp=1791044465000)])["inserted"], 0)
        self.assertEqual(sheet.entries, [])
        self.assertGreater(sheet.reads, 0)

    def test_partial_foreign_rows_preserved(self):
        row = {"measurement_id": "manual-entry", "source": "manual", "weight_kg": 80}
        sheet = FakeSheet(entries=[(2, row)])
        self.run_sync(sheet, [self.raw()])
        self.assertEqual(sheet.entries[0], (2, row))
        self.assertEqual(sheet.entries[1][0], 3)

    def test_serial_date_and_literal_json_cells(self):
        row = s.garmin.normalize_index_s2(self.raw(), observed_at_utc=self.now.isoformat())
        cells = s.cell_values(row)
        self.assertIn("numberValue", cells[1]["userEnteredValue"])
        self.assertIn("stringValue", cells[-1]["userEnteredValue"])
        values = [next(iter(c["userEnteredValue"].values())) if c else None for c in cells]
        self.assertEqual(s.canonical_row(values), row)


if __name__ == "__main__":
    unittest.main()
