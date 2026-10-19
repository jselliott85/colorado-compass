/** Normalize only timestamped, archived SDM evidence. No temperature-to-runtime inference. */
'use strict';
function recoverArchive(records, ledger, retrievedAt) {
  const observations = [], health = {}, audit = [];
  const seen = new Map(ledger.map(r => [r.device_id + '|' + r.timestamp_utc + '|' + r.kind, r]));
  for (const entry of records) {
    const {file, raw} = entry;
    const note = {recovery_key: 'archive:' + file.id, source: 'sdm_raw_archive', source_file: file.name, retrieved_at_utc: retrievedAt, observation_time_utc: '', source_resolution: 'instantaneous_snapshot_or_event', outcome: '', notes: ''};
    if (Array.isArray(raw) || raw.run_id) {
      for (const h of Array.isArray(raw) ? raw : [raw]) {
        if (h.run_id && Number.isFinite(Date.parse(h.finished_at_utc))) health[h.run_id] = h;
      }
      note.outcome = 'continuity_checkpoint';
    } else if (raw.event) {
      const e = raw.event, update = e.resourceUpdate;
      if (update && update.traits && e.eventId && Number.isFinite(Date.parse(e.timestamp))) {
        const r = {observation_id: 'event:' + e.eventId, timestamp_utc: new Date(e.timestamp).toISOString().replace('.000Z','Z'), device_id: update.name, kind: 'event', traits_json: JSON.stringify(update.traits), ingested_at_utc: raw.ingested_at_utc || retrievedAt};
        const found = ledger.find(v => v.observation_id === r.observation_id);
        if (found && found.traits_json !== r.traits_json) throw Error('conflicting archived event');
        if (!found) observations.push(r);
        note.outcome = found ? 'already_in_ledger' : 'recovered';note.observation_time_utc = r.timestamp_utc;
      } else {note.outcome = 'excluded_no_device_state';note.notes = 'Authorization/administrative event; no HVAC observation.';}
    } else {
      const discovery = /^discovery-(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d\.\d{3}Z)\.json\.gz$/.exec(file.name);
      const time = raw.observed_at_utc || (discovery ? discovery[1]+'T'+discovery[2]+':'+discovery[3]+':'+discovery[4] : null);
      const devices = (raw.response || raw).devices || [];
      if (!time || !Number.isFinite(Date.parse(time))) {note.outcome='excluded_unverified_time';note.notes='File modification time is not accepted as a thermostat observation timestamp.';}
      else {
        note.observation_time_utc=time;
        for (const device of devices.filter(d => d.type === 'sdm.devices.types.THERMOSTAT')) {
          const r={observation_id:'archive:'+file.id+':'+device.name.split('/').pop(),timestamp_utc:time,device_id:device.name,kind:'snapshot',traits_json:JSON.stringify(device.traits||{}),ingested_at_utc:raw.ingested_at_utc||file.createdTime||retrievedAt};
          const found=seen.get(r.device_id+'|'+time+'|snapshot');
          if(found && found.traits_json!==r.traits_json)throw Error('conflicting archived snapshot');
          if(!found){observations.push(r);seen.set(r.device_id+'|'+time+'|snapshot',r);}
          note.outcome=found?'already_in_ledger':'recovered';
        }
        note.notes=discovery?'Read-completion timestamp retained in collector-generated archive filename; not a device measurement timestamp.':'Explicit snapshot read timestamp from raw envelope.';
      }
    }
    audit.push(note);
  }
  return {observations,health:Object.values(health),audit};
}
module.exports={recoverArchive};
