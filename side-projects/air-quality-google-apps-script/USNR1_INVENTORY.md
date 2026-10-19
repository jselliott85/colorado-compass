# US-NR1 supplied-batch inspection — 2026-10-19

41 daily files, September 1–October 11, 2026. All 11,808 centered five-minute records retained. September 20–October 11 has 6,336 records and 2,112 complete quarter-hours, exactly three records per bin. Record coverage is not quality approval.

UTC centers run 00:02:30–23:57:30; `base_time` is UTC midnight and `interval(sec)=300`. This matches [ISFS conventions §7.1](https://www.eol.ucar.edu/sites/default/files/2023-09/ISFS_netCDF_FileConventions.pdf). September 20 00:02:30 UTC is September 19 18:02:30 MDT.

Every file was inspected. Full per-file global attributes, dimensions, variable attributes, hashes and missing counts are retained privately in `tmp/usnr1-import/` (inventory.json, validation.json, SQLite). Single `time` dimension: 288. Global wind attributes: instrument coordinates; horizontal rotation=0; tilt correction=0. NIDAS version v1.2-1721.

Float `_FillValue` is approximately 1e37; count `_FillValue` is 0. NetCDF masks are honored, with NaN/infinity also missing. No invented numeric-range exclusions. Raw count zeros are recoverable in the original NetCDF; normalized tables treat the declared fill as null.

## Selection and unresolved semantics

Master: presence, record count, coverage, mean `T3_21m` (above-canopy air temperature), mean `tc_csi_24m` (sonic temperature), and mean `w_csi_24m` (instrument-axis velocity, not corrected vertical flow). Per-field valid counts remain in US_NR1_15min. All raw variables retain exact names in US_NR1_5min. All three ordered selected native records, including QC and second moments, remain in `native_samples_json` in US_NR1_15min. No variance/covariance averaging or pooling is performed.

Second-moment names, prime notation and units support their interpretation as native variances/covariances. Pooling to 15 minutes needs validated sample-count associations and estimator conventions. The 24m sonic fields point to `counts_co2_li7200` rather than `counts_csi_24m`; do not silently repair this. `diag` is not assumed to be the documented `ldiag` fraction or decoded as a bitmask. Sensor height 24m vs Sean’s 21.5/24m description remains unresolved. No universal QC pass threshold is asserted. TKE is deferred with pooled second moments; no compass direction, u*, L, z/L, sensible or latent heat flux.

Raw voltage channels are not converted to physical meteorological quantities. In particular `w_dir_*` is mV and `Rsw_in_sp510_mV` reports C despite its name; retain these metadata conflicts rather than guessing.

[Burns et al. 2016](https://gi.copernicus.org/articles/5/451/2016/) documents acquisition/site record keeping; [NCAR tilt corrections](https://www.eol.ucar.edu/content/sonic-tilt-corrections) explains why flux interpretation requires validated correction. Neither supplies a validated 2026 rotation/QC recipe for this batch.

## Complete variable inventory

| Source name | Units | Additional source attributes |
| --- | --- | --- |
| `GPSnsat_niwot` | count | `{"_FillValue": 9.999999933815813e+36, "long_name": "Number of GPS satellites tracked", "short_name": "GPSnsat.niwot"}` |
| `GPSstat_niwot` | none | `{"_FillValue": 9.999999933815813e+36, "long_name": "GPS rcvr status: 1=OK(A), 0=warning(V)", "short_name": "GPSstat.niwot"}` |
| `PAR_dn` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "PAR.dn"}` |
| `PAR_up` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "PAR.up"}` |
| `PARdn_2m` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "PARdn.2m"}` |
| `PARup_2m` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "PARup.2m"}` |
| `Ptot_18m` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Ptot.18m"}` |
| `RH2_8m` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "RH2.8m"}` |
| `RH3_21m` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "RH3.21m"}` |
| `RH4_met` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "RH4.met"}` |
| `RH5_met` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "RH5.met"}` |
| `RH_REBS1_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "RH.REBS1.mV"}` |
| `RH_REBS2_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "RH.REBS2.mV"}` |
| `RH_eol` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "RH.eol"}` |
| `R_diffuse_spn1` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "R.diffuse.spn1"}` |
| `R_tot_spn1` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "R.tot.spn1"}` |
| `Rlw_in_sn500` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rlw.in.sn500"}` |
| `Rlw_out_sn500` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rlw.out.sn500"}` |
| `Rpile_in` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rpile.in"}` |
| `Rpile_in_cnr4` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rpile.in.cnr4"}` |
| `Rpile_in_sl510_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rpile.in.sl510.mV"}` |
| `Rpile_out` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rpile.out"}` |
| `Rpile_out_cnr4` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rpile.out.cnr4"}` |
| `Rsw_in` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rsw.in"}` |
| `Rsw_in_cnr4` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rsw.in.cnr4"}` |
| `Rsw_in_sn500` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rsw.in.sn500"}` |
| `Rsw_in_sp510_mV` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rsw.in.sp510.mV"}` |
| `Rsw_out` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rsw.out"}` |
| `Rsw_out_cnr4` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rsw.out.cnr4"}` |
| `Rsw_out_sn500` | W/m^2 | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rsw.out.sn500"}` |
| `Rsw_out_sp610_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Rsw.out.sp610.mV"}` |
| `Stratum` |  | `{"_FillValue": 9.999999933815813e+36, "long_name": "NTP stratum", "short_name": "Stratum"}` |
| `T1` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T1"}` |
| `T10` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T10"}` |
| `T11` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T11"}` |
| `T12` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T12"}` |
| `T2` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T2"}` |
| `T2_8m` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T2.8m"}` |
| `T3` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T3"}` |
| `T3_21m` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T3.21m"}` |
| `T4` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T4"}` |
| `T4_met` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T4.met"}` |
| `T5` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T5"}` |
| `T5_met` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T5.met"}` |
| `T6` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T6"}` |
| `T7` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T7"}` |
| `T8` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T8"}` |
| `T9` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "T9"}` |
| `T_case` | K | `{"_FillValue": 9.999999933815813e+36, "short_name": "T.case"}` |
| `T_case_cnr4` | K | `{"_FillValue": 9.999999933815813e+36, "short_name": "T.case.cnr4"}` |
| `T_eol` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "T.eol"}` |
| `T_therm_cnr4_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "T.therm.cnr4.mV"}` |
| `T_therm_sl510_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "T.therm.sl510.mV"}` |
| `Ta_REBS1_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Ta.REBS1.mV"}` |
| `Ta_REBS2_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Ta.REBS2.mV"}` |
| `Tc_REBS1_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Tc.REBS1.mV"}` |
| `Tc_REBS2_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Tc.REBS2.mV"}` |
| `Tcpu` | degC | `{"_FillValue": 9.999999933815813e+36, "long_name": "CPU Temperature", "short_name": "Tcpu"}` |
| `Timeoffset` | usec | `{"_FillValue": 9.999999933815813e+36, "long_name": "Clock offset, system-reference", "short_name": "Timeoffset"}` |
| `Tir_pile_si121_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Tir.pile.si121.mV"}` |
| `Tir_sn7792_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Tir.sn7792.mV"}` |
| `Tir_sn7794_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Tir.sn7794.mV"}` |
| `Tir_therm_si121_mV` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "Tir.therm.si121.mV"}` |
| `Tref` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "Tref"}` |
| `Ttc_2_5m` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "Ttc.2.5m"}` |
| `Ttc_Ttype` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "Ttc.Ttype"}` |
| `Ttc_csat3` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "Ttc.csat3"}` |
| `Ttc_csat4` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "Ttc.csat4"}` |
| `Ttc_csat5` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "Ttc.csat5"}` |
| `Ttc_csat6` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "Ttc.csat6"}` |
| `Vbatt_isffa` | V | `{"_FillValue": 9.999999933815813e+36, "short_name": "Vbatt.isffa"}` |
| `ap200_P_cell` | kPa | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.P.cell"}` |
| `ap200_T_cell` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.T.cell"}` |
| `ap200_Tair1` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.Tair1"}` |
| `ap200_batt_volt` | V | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.batt.volt"}` |
| `ap200_co2` | ppm | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.co2"}` |
| `ap200_diag` | diag | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.diag"}` |
| `ap200_h2o` | ppt | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.h2o"}` |
| `ap200_pump_press` | kPa | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.pump.press"}` |
| `ap200_sampleflow` | mlmin | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.sampleflow"}` |
| `ap200_valve` | cnt | `{"_FillValue": 9.999999933815813e+36, "short_name": "ap200.valve"}` |
| `base_time` | seconds since 1970-01-01 00:00:00 00:00 | `{}` |
| `co2_co2__li7200` | (V)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7200", "long_name": "2nd moment", "short_name": "co2'co2'.li7200"}` |
| `co2_co2__li7500a_21_5m` | (V)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7500a_21m", "long_name": "2nd moment", "short_name": "co2'co2'.li7500a.21.5m"}` |
| `co2_ec` | V | `{"_FillValue": 9.999999933815813e+36, "short_name": "co2.ec"}` |
| `co2_li7200` | V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7200", "short_name": "co2.li7200"}` |
| `co2_li7500a_21_5m` | V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7500a_21m", "short_name": "co2.li7500a.21.5m"}` |
| `co2_li7500a_2_5m` | umol/mol | `{"_FillValue": 9.999999933815813e+36, "short_name": "co2.li7500a.2.5m"}` |
| `co2b_ec` | V | `{"_FillValue": 9.999999933815813e+36, "short_name": "co2b.ec"}` |
| `counts_co2_li7200` |   | `{"_FillValue": 0}` |
| `counts_co2_li7500a_21m` |   | `{"_FillValue": 0}` |
| `counts_csi_24m` |   | `{"_FillValue": 0}` |
| `counts_csi_2_5m` |   | `{"_FillValue": 0}` |
| `counts_csi_5_7m` |   | `{"_FillValue": 0}` |
| `counts_csi_eol` |   | `{"_FillValue": 0}` |
| `counts_h2o_li7200` |   | `{"_FillValue": 0}` |
| `counts_h2o_li7500a_21m` |   | `{"_FillValue": 0}` |
| `cs107_Tsoil` | C | `{"_FillValue": 9.999999933815813e+36, "short_name": "cs107.Tsoil"}` |
| `cs253_1` | kOhms | `{"_FillValue": 9.999999933815813e+36, "short_name": "cs253.1"}` |
| `cs253_2` | kOhms | `{"_FillValue": 9.999999933815813e+36, "short_name": "cs253.2"}` |
| `cs616_period` | sec | `{"_FillValue": 9.999999933815813e+36, "short_name": "cs616.period"}` |
| `cs616_vwc` | percent | `{"_FillValue": 9.999999933815813e+36, "short_name": "cs616.vwc"}` |
| `diag` | diag | `{"_FillValue": 9.999999933815813e+36, "short_name": "diag"}` |
| `diag2_5` | diag | `{"_FillValue": 9.999999933815813e+36, "short_name": "diag2.5"}` |
| `diag5_7` | diag | `{"_FillValue": 9.999999933815813e+36, "short_name": "diag5.7"}` |
| `diag_eol` | diag | `{"_FillValue": 9.999999933815813e+36, "short_name": "diag.eol"}` |
| `ec_Ftot` | V | `{"_FillValue": 9.999999933815813e+36, "short_name": "ec.Ftot"}` |
| `h2o_ec` | V | `{"_FillValue": 9.999999933815813e+36, "short_name": "h2o.ec"}` |
| `h2o_h2o__li7200` | (V)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7200", "long_name": "2nd moment", "short_name": "h2o'h2o'.li7200"}` |
| `h2o_h2o__li7500a_21_5m` | (V)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7500a_21m", "long_name": "2nd moment", "short_name": "h2o'h2o'.li7500a.21.5m"}` |
| `h2o_kr` | V | `{"_FillValue": 9.999999933815813e+36, "short_name": "h2o.kr"}` |
| `h2o_li7200` | V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7200", "short_name": "h2o.li7200"}` |
| `h2o_li7500a_21_5m` | V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7500a_21m", "short_name": "h2o.li7500a.21.5m"}` |
| `h2o_li7500a_2_5m` | mmol/mol | `{"_FillValue": 9.999999933815813e+36, "short_name": "h2o.li7500a.2.5m"}` |
| `leaf_wet` | T/F | `{"_FillValue": 9.999999933815813e+36, "short_name": "leaf.wet"}` |
| `p_ec` | V | `{"_FillValue": 9.999999933815813e+36, "short_name": "p.ec"}` |
| `par_kz1_old` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "par.kz1_old"}` |
| `par_kz2_new` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "par.kz2_new"}` |
| `pluvio1_accum_NRT` | mm | `{"_FillValue": 9.999999933815813e+36, "short_name": "pluvio1.accum.NRT"}` |
| `pluvio1_bucket_NRT` | mm | `{"_FillValue": 9.999999933815813e+36, "short_name": "pluvio1.bucket.NRT"}` |
| `pluvio1_intensity` | mm/hr | `{"_FillValue": 9.999999933815813e+36, "short_name": "pluvio1.intensity"}` |
| `pluvio2_accum_NRT` | mm | `{"_FillValue": 9.999999933815813e+36, "short_name": "pluvio2.accum.NRT"}` |
| `pluvio2_bucket_NRT` | mm | `{"_FillValue": 9.999999933815813e+36, "short_name": "pluvio2.bucket.NRT"}` |
| `pluvio2_intensity` | mm/hr | `{"_FillValue": 9.999999933815813e+36, "short_name": "pluvio2.intensity"}` |
| `precip_mm` | mm | `{"_FillValue": 9.999999933815813e+36, "short_name": "precip.mm"}` |
| `status_ec` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "status.ec"}` |
| `t_ec` | V | `{"_FillValue": 9.999999933815813e+36, "short_name": "t.ec"}` |
| `tc_csi_24m` | C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "short_name": "tc.csi.24m"}` |
| `tc_csi_2_5m` | C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "short_name": "tc.csi.2.5m"}` |
| `tc_csi_5_7m` | C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "short_name": "tc.csi.5.7m"}` |
| `tc_csi_eol` | C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "short_name": "tc.csi.eol"}` |
| `tc_tc__csi_24m` | (C)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "tc'tc'.csi.24m"}` |
| `tc_tc__csi_2_5m` | (C)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "tc'tc'.csi.2.5m"}` |
| `tc_tc__csi_5_7m` | (C)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "tc'tc'.csi.5.7m"}` |
| `tc_tc__csi_eol` | (C)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "tc'tc'.csi.eol"}` |
| `time` | seconds since 2026-09-01 00:00:00 00:00 | `{"interval(sec)": 300.0}` |
| `u_co2___csi_eol_li7200_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7200", "long_name": "2nd moment", "short_name": "u'co2'.(csi.eol,li7200)"}` |
| `u_co2___csi_eol_li7500a_21_5m_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7500a_21m", "long_name": "2nd moment", "short_name": "u'co2'.(csi.eol,li7500a.21.5m)"}` |
| `u_csi_24m` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "short_name": "u.csi.24m"}` |
| `u_csi_2_5m` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "short_name": "u.csi.2.5m"}` |
| `u_csi_5_7m` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "short_name": "u.csi.5.7m"}` |
| `u_csi_eol` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "short_name": "u.csi.eol"}` |
| `u_h2o___csi_eol_li7200_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7200", "long_name": "2nd moment", "short_name": "u'h2o'.(csi.eol,li7200)"}` |
| `u_h2o___csi_eol_li7500a_21_5m_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7500a_21m", "long_name": "2nd moment", "short_name": "u'h2o'.(csi.eol,li7500a.21.5m)"}` |
| `u_tc__csi_24m` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "u'tc'.csi.24m"}` |
| `u_tc__csi_2_5m` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "u'tc'.csi.2.5m"}` |
| `u_tc__csi_5_7m` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "u'tc'.csi.5.7m"}` |
| `u_tc__csi_eol` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "u'tc'.csi.eol"}` |
| `u_u__csi_24m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "u'u'.csi.24m"}` |
| `u_u__csi_2_5m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "u'u'.csi.2.5m"}` |
| `u_u__csi_5_7m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "u'u'.csi.5.7m"}` |
| `u_u__csi_eol` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "u'u'.csi.eol"}` |
| `u_v__csi_24m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "u'v'.csi.24m"}` |
| `u_v__csi_2_5m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "u'v'.csi.2.5m"}` |
| `u_v__csi_5_7m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "u'v'.csi.5.7m"}` |
| `u_v__csi_eol` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "u'v'.csi.eol"}` |
| `u_w__csi_24m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "u'w'.csi.24m"}` |
| `u_w__csi_2_5m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "u'w'.csi.2.5m"}` |
| `u_w__csi_5_7m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "u'w'.csi.5.7m"}` |
| `u_w__csi_eol` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "u'w'.csi.eol"}` |
| `v_co2___csi_eol_li7200_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7200", "long_name": "2nd moment", "short_name": "v'co2'.(csi.eol,li7200)"}` |
| `v_co2___csi_eol_li7500a_21_5m_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7500a_21m", "long_name": "2nd moment", "short_name": "v'co2'.(csi.eol,li7500a.21.5m)"}` |
| `v_csi_24m` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "short_name": "v.csi.24m"}` |
| `v_csi_2_5m` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "short_name": "v.csi.2.5m"}` |
| `v_csi_5_7m` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "short_name": "v.csi.5.7m"}` |
| `v_csi_eol` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "short_name": "v.csi.eol"}` |
| `v_h2o___csi_eol_li7200_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7200", "long_name": "2nd moment", "short_name": "v'h2o'.(csi.eol,li7200)"}` |
| `v_h2o___csi_eol_li7500a_21_5m_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7500a_21m", "long_name": "2nd moment", "short_name": "v'h2o'.(csi.eol,li7500a.21.5m)"}` |
| `v_tc__csi_24m` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "v'tc'.csi.24m"}` |
| `v_tc__csi_2_5m` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "v'tc'.csi.2.5m"}` |
| `v_tc__csi_5_7m` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "v'tc'.csi.5.7m"}` |
| `v_tc__csi_eol` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "v'tc'.csi.eol"}` |
| `v_v__csi_24m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "v'v'.csi.24m"}` |
| `v_v__csi_2_5m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "v'v'.csi.2.5m"}` |
| `v_v__csi_5_7m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "v'v'.csi.5.7m"}` |
| `v_v__csi_eol` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "v'v'.csi.eol"}` |
| `v_w__csi_24m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "v'w'.csi.24m"}` |
| `v_w__csi_2_5m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "v'w'.csi.2.5m"}` |
| `v_w__csi_5_7m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "v'w'.csi.5.7m"}` |
| `v_w__csi_eol` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "v'w'.csi.eol"}` |
| `w_co2___csi_eol_li7200_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7200", "long_name": "2nd moment", "short_name": "w'co2'.(csi.eol,li7200)"}` |
| `w_co2___csi_eol_li7500a_21_5m_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_co2_li7500a_21m", "long_name": "2nd moment", "short_name": "w'co2'.(csi.eol,li7500a.21.5m)"}` |
| `w_csi_24m` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "short_name": "w.csi.24m"}` |
| `w_csi_2_5m` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "short_name": "w.csi.2.5m"}` |
| `w_csi_5_7m` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "short_name": "w.csi.5.7m"}` |
| `w_csi_eol` | m/s | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "short_name": "w.csi.eol"}` |
| `w_dir_16m` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "w.dir.16m"}` |
| `w_dir_25m` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "w.dir.25m"}` |
| `w_h2o___csi_eol_li7200_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7200", "long_name": "2nd moment", "short_name": "w'h2o'.(csi.eol,li7200)"}` |
| `w_h2o___csi_eol_li7500a_21_5m_` | m/s V | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_h2o_li7500a_21m", "long_name": "2nd moment", "short_name": "w'h2o'.(csi.eol,li7500a.21.5m)"}` |
| `w_spd_16m` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "w.spd.16m"}` |
| `w_spd_25m` | mV | `{"_FillValue": 9.999999933815813e+36, "short_name": "w.spd.25m"}` |
| `w_tc__csi_24m` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "w'tc'.csi.24m"}` |
| `w_tc__csi_2_5m` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "w'tc'.csi.2.5m"}` |
| `w_tc__csi_5_7m` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "w'tc'.csi.5.7m"}` |
| `w_tc__csi_eol` | m/s C | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "w'tc'.csi.eol"}` |
| `w_w__csi_24m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_24m", "long_name": "2nd moment", "short_name": "w'w'.csi.24m"}` |
| `w_w__csi_2_5m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_2_5m", "long_name": "2nd moment", "short_name": "w'w'.csi.2.5m"}` |
| `w_w__csi_5_7m` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_5_7m", "long_name": "2nd moment", "short_name": "w'w'.csi.5.7m"}` |
| `w_w__csi_eol` | (m/s)^2 | `{"_FillValue": 9.999999933815813e+36, "counts": "counts_csi_eol", "long_name": "2nd moment", "short_name": "w'w'.csi.eol"}` |

## Live batch acceptance

The existing private workbook now contains all 11,808 native rows / 198 observed variables (202 columns including timestamps/provenance), 3,936 quarter-hours, and 2,088 matched existing Master rows. Master starts September 20 at 06:00 UTC (local midnight), so 24 earlier UTC quarters are retained only in source tables. All 2,816 pre-existing Master rows across all 77 legacy columns were compared before/after and matched exactly; Events also matched exactly. Other source tables were outside every write range. Original ZIP archived privately in the existing ChatGPT Drive folder.

After successful interactive Google reauthentication, collector version 6 was deployed on 2026-10-19 at the existing web-app URL. No scheduler or collection interval was changed. Scheduled README/Schema regeneration now retains NR1 caveats; header notes also preserve source metadata.

All 3,936 quarter-hour keys/counts and means/per-field valid counts were read back successfully. Native numeric/provenance rows from September 20, October 1 and October 11 matched all 202 columns (floating tolerance 1e-12 relative). The 221 added Schema rows were verified by readback. Tests: 19 JavaScript, 2 Python, static checks passed.
