/** Manual, offline-supplied US-NR1 batches only. No remote feed or polling. */
const AQ_NR1_VARIABLE_METADATA = Object.freeze({
  "GPSnsat_niwot": {
    "_FillValue": 9.999999933815813e+36,
    "long_name": "Number of GPS satellites tracked",
    "short_name": "GPSnsat.niwot",
    "units": "count"
  },
  "GPSstat_niwot": {
    "_FillValue": 9.999999933815813e+36,
    "long_name": "GPS rcvr status: 1=OK(A), 0=warning(V)",
    "short_name": "GPSstat.niwot",
    "units": "none"
  },
  "PAR_dn": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "PAR.dn",
    "units": "mV"
  },
  "PAR_up": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "PAR.up",
    "units": "mV"
  },
  "PARdn_2m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "PARdn.2m",
    "units": "mV"
  },
  "PARup_2m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "PARup.2m",
    "units": "mV"
  },
  "Ptot_18m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Ptot.18m",
    "units": "mV"
  },
  "RH2_8m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "RH2.8m",
    "units": "mV"
  },
  "RH3_21m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "RH3.21m",
    "units": "mV"
  },
  "RH4_met": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "RH4.met",
    "units": "mV"
  },
  "RH5_met": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "RH5.met",
    "units": "mV"
  },
  "RH_REBS1_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "RH.REBS1.mV",
    "units": "mV"
  },
  "RH_REBS2_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "RH.REBS2.mV",
    "units": "mV"
  },
  "RH_eol": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "RH.eol",
    "units": "mV"
  },
  "R_diffuse_spn1": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "R.diffuse.spn1",
    "units": "mV"
  },
  "R_tot_spn1": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "R.tot.spn1",
    "units": "mV"
  },
  "Rlw_in_sn500": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rlw.in.sn500",
    "units": "W/m^2"
  },
  "Rlw_out_sn500": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rlw.out.sn500",
    "units": "W/m^2"
  },
  "Rpile_in": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rpile.in",
    "units": "W/m^2"
  },
  "Rpile_in_cnr4": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rpile.in.cnr4",
    "units": "W/m^2"
  },
  "Rpile_in_sl510_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rpile.in.sl510.mV",
    "units": "mV"
  },
  "Rpile_out": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rpile.out",
    "units": "W/m^2"
  },
  "Rpile_out_cnr4": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rpile.out.cnr4",
    "units": "W/m^2"
  },
  "Rsw_in": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rsw.in",
    "units": "W/m^2"
  },
  "Rsw_in_cnr4": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rsw.in.cnr4",
    "units": "W/m^2"
  },
  "Rsw_in_sn500": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rsw.in.sn500",
    "units": "W/m^2"
  },
  "Rsw_in_sp510_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rsw.in.sp510.mV",
    "units": "C"
  },
  "Rsw_out": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rsw.out",
    "units": "W/m^2"
  },
  "Rsw_out_cnr4": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rsw.out.cnr4",
    "units": "W/m^2"
  },
  "Rsw_out_sn500": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rsw.out.sn500",
    "units": "W/m^2"
  },
  "Rsw_out_sp610_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Rsw.out.sp610.mV",
    "units": "mV"
  },
  "Stratum": {
    "_FillValue": 9.999999933815813e+36,
    "long_name": "NTP stratum",
    "short_name": "Stratum"
  },
  "T1": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T1",
    "units": "C"
  },
  "T10": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T10",
    "units": "C"
  },
  "T11": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T11",
    "units": "C"
  },
  "T12": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T12",
    "units": "C"
  },
  "T2": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T2",
    "units": "C"
  },
  "T2_8m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T2.8m",
    "units": "C"
  },
  "T3": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T3",
    "units": "C"
  },
  "T3_21m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T3.21m",
    "units": "C"
  },
  "T4": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T4",
    "units": "C"
  },
  "T4_met": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T4.met",
    "units": "C"
  },
  "T5": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T5",
    "units": "C"
  },
  "T5_met": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T5.met",
    "units": "C"
  },
  "T6": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T6",
    "units": "C"
  },
  "T7": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T7",
    "units": "C"
  },
  "T8": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T8",
    "units": "C"
  },
  "T9": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T9",
    "units": "C"
  },
  "T_case": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T.case",
    "units": "K"
  },
  "T_case_cnr4": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T.case.cnr4",
    "units": "K"
  },
  "T_eol": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T.eol",
    "units": "mV"
  },
  "T_therm_cnr4_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T.therm.cnr4.mV",
    "units": "mV"
  },
  "T_therm_sl510_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "T.therm.sl510.mV",
    "units": "mV"
  },
  "Ta_REBS1_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Ta.REBS1.mV",
    "units": "mV"
  },
  "Ta_REBS2_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Ta.REBS2.mV",
    "units": "mV"
  },
  "Tc_REBS1_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Tc.REBS1.mV",
    "units": "mV"
  },
  "Tc_REBS2_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Tc.REBS2.mV",
    "units": "mV"
  },
  "Tcpu": {
    "_FillValue": 9.999999933815813e+36,
    "long_name": "CPU Temperature",
    "short_name": "Tcpu",
    "units": "degC"
  },
  "Timeoffset": {
    "_FillValue": 9.999999933815813e+36,
    "long_name": "Clock offset, system-reference",
    "short_name": "Timeoffset",
    "units": "usec"
  },
  "Tir_pile_si121_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Tir.pile.si121.mV",
    "units": "mV"
  },
  "Tir_sn7792_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Tir.sn7792.mV",
    "units": "mV"
  },
  "Tir_sn7794_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Tir.sn7794.mV",
    "units": "mV"
  },
  "Tir_therm_si121_mV": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Tir.therm.si121.mV",
    "units": "mV"
  },
  "Tref": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Tref",
    "units": "C"
  },
  "Ttc_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Ttc.2.5m",
    "units": "C"
  },
  "Ttc_Ttype": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Ttc.Ttype",
    "units": "C"
  },
  "Ttc_csat3": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Ttc.csat3",
    "units": "C"
  },
  "Ttc_csat4": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Ttc.csat4",
    "units": "C"
  },
  "Ttc_csat5": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Ttc.csat5",
    "units": "C"
  },
  "Ttc_csat6": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Ttc.csat6",
    "units": "C"
  },
  "Vbatt_isffa": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "Vbatt.isffa",
    "units": "V"
  },
  "ap200_P_cell": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.P.cell",
    "units": "kPa"
  },
  "ap200_T_cell": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.T.cell",
    "units": "C"
  },
  "ap200_Tair1": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.Tair1",
    "units": "C"
  },
  "ap200_batt_volt": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.batt.volt",
    "units": "V"
  },
  "ap200_co2": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.co2",
    "units": "ppm"
  },
  "ap200_diag": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.diag",
    "units": "diag"
  },
  "ap200_h2o": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.h2o",
    "units": "ppt"
  },
  "ap200_pump_press": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.pump.press",
    "units": "kPa"
  },
  "ap200_sampleflow": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.sampleflow",
    "units": "mlmin"
  },
  "ap200_valve": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ap200.valve",
    "units": "cnt"
  },
  "co2_co2__li7200": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7200",
    "long_name": "2nd moment",
    "short_name": "co2'co2'.li7200",
    "units": "(V)^2"
  },
  "co2_co2__li7500a_21_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7500a_21m",
    "long_name": "2nd moment",
    "short_name": "co2'co2'.li7500a.21.5m",
    "units": "(V)^2"
  },
  "co2_ec": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "co2.ec",
    "units": "V"
  },
  "co2_li7200": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7200",
    "short_name": "co2.li7200",
    "units": "V"
  },
  "co2_li7500a_21_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7500a_21m",
    "short_name": "co2.li7500a.21.5m",
    "units": "V"
  },
  "co2_li7500a_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "co2.li7500a.2.5m",
    "units": "umol/mol"
  },
  "co2b_ec": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "co2b.ec",
    "units": "V"
  },
  "counts_co2_li7200": {
    "_FillValue": 0,
    "units": " "
  },
  "counts_co2_li7500a_21m": {
    "_FillValue": 0,
    "units": " "
  },
  "counts_csi_24m": {
    "_FillValue": 0,
    "units": " "
  },
  "counts_csi_2_5m": {
    "_FillValue": 0,
    "units": " "
  },
  "counts_csi_5_7m": {
    "_FillValue": 0,
    "units": " "
  },
  "counts_csi_eol": {
    "_FillValue": 0,
    "units": " "
  },
  "counts_h2o_li7200": {
    "_FillValue": 0,
    "units": " "
  },
  "counts_h2o_li7500a_21m": {
    "_FillValue": 0,
    "units": " "
  },
  "cs107_Tsoil": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "cs107.Tsoil",
    "units": "C"
  },
  "cs253_1": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "cs253.1",
    "units": "kOhms"
  },
  "cs253_2": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "cs253.2",
    "units": "kOhms"
  },
  "cs616_period": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "cs616.period",
    "units": "sec"
  },
  "cs616_vwc": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "cs616.vwc",
    "units": "percent"
  },
  "diag": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "diag",
    "units": "diag"
  },
  "diag2_5": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "diag2.5",
    "units": "diag"
  },
  "diag5_7": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "diag5.7",
    "units": "diag"
  },
  "diag_eol": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "diag.eol",
    "units": "diag"
  },
  "ec_Ftot": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "ec.Ftot",
    "units": "V"
  },
  "h2o_ec": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "h2o.ec",
    "units": "V"
  },
  "h2o_h2o__li7200": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7200",
    "long_name": "2nd moment",
    "short_name": "h2o'h2o'.li7200",
    "units": "(V)^2"
  },
  "h2o_h2o__li7500a_21_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7500a_21m",
    "long_name": "2nd moment",
    "short_name": "h2o'h2o'.li7500a.21.5m",
    "units": "(V)^2"
  },
  "h2o_kr": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "h2o.kr",
    "units": "V"
  },
  "h2o_li7200": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7200",
    "short_name": "h2o.li7200",
    "units": "V"
  },
  "h2o_li7500a_21_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7500a_21m",
    "short_name": "h2o.li7500a.21.5m",
    "units": "V"
  },
  "h2o_li7500a_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "h2o.li7500a.2.5m",
    "units": "mmol/mol"
  },
  "leaf_wet": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "leaf.wet",
    "units": "T/F"
  },
  "p_ec": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "p.ec",
    "units": "V"
  },
  "par_kz1_old": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "par.kz1_old",
    "units": "mV"
  },
  "par_kz2_new": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "par.kz2_new",
    "units": "mV"
  },
  "pluvio1_accum_NRT": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "pluvio1.accum.NRT",
    "units": "mm"
  },
  "pluvio1_bucket_NRT": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "pluvio1.bucket.NRT",
    "units": "mm"
  },
  "pluvio1_intensity": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "pluvio1.intensity",
    "units": "mm/hr"
  },
  "pluvio2_accum_NRT": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "pluvio2.accum.NRT",
    "units": "mm"
  },
  "pluvio2_bucket_NRT": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "pluvio2.bucket.NRT",
    "units": "mm"
  },
  "pluvio2_intensity": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "pluvio2.intensity",
    "units": "mm/hr"
  },
  "precip_mm": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "precip.mm",
    "units": "mm"
  },
  "status_ec": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "status.ec",
    "units": "mV"
  },
  "t_ec": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "t.ec",
    "units": "V"
  },
  "tc_csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "short_name": "tc.csi.24m",
    "units": "C"
  },
  "tc_csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "short_name": "tc.csi.2.5m",
    "units": "C"
  },
  "tc_csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "short_name": "tc.csi.5.7m",
    "units": "C"
  },
  "tc_csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "short_name": "tc.csi.eol",
    "units": "C"
  },
  "tc_tc__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "tc'tc'.csi.24m",
    "units": "(C)^2"
  },
  "tc_tc__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "tc'tc'.csi.2.5m",
    "units": "(C)^2"
  },
  "tc_tc__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "tc'tc'.csi.5.7m",
    "units": "(C)^2"
  },
  "tc_tc__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "tc'tc'.csi.eol",
    "units": "(C)^2"
  },
  "u_co2___csi_eol_li7200_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7200",
    "long_name": "2nd moment",
    "short_name": "u'co2'.(csi.eol,li7200)",
    "units": "m/s V"
  },
  "u_co2___csi_eol_li7500a_21_5m_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7500a_21m",
    "long_name": "2nd moment",
    "short_name": "u'co2'.(csi.eol,li7500a.21.5m)",
    "units": "m/s V"
  },
  "u_csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "short_name": "u.csi.24m",
    "units": "m/s"
  },
  "u_csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "short_name": "u.csi.2.5m",
    "units": "m/s"
  },
  "u_csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "short_name": "u.csi.5.7m",
    "units": "m/s"
  },
  "u_csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "short_name": "u.csi.eol",
    "units": "m/s"
  },
  "u_h2o___csi_eol_li7200_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7200",
    "long_name": "2nd moment",
    "short_name": "u'h2o'.(csi.eol,li7200)",
    "units": "m/s V"
  },
  "u_h2o___csi_eol_li7500a_21_5m_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7500a_21m",
    "long_name": "2nd moment",
    "short_name": "u'h2o'.(csi.eol,li7500a.21.5m)",
    "units": "m/s V"
  },
  "u_tc__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "u'tc'.csi.24m",
    "units": "m/s C"
  },
  "u_tc__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "u'tc'.csi.2.5m",
    "units": "m/s C"
  },
  "u_tc__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "u'tc'.csi.5.7m",
    "units": "m/s C"
  },
  "u_tc__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "u'tc'.csi.eol",
    "units": "m/s C"
  },
  "u_u__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "u'u'.csi.24m",
    "units": "(m/s)^2"
  },
  "u_u__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "u'u'.csi.2.5m",
    "units": "(m/s)^2"
  },
  "u_u__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "u'u'.csi.5.7m",
    "units": "(m/s)^2"
  },
  "u_u__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "u'u'.csi.eol",
    "units": "(m/s)^2"
  },
  "u_v__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "u'v'.csi.24m",
    "units": "(m/s)^2"
  },
  "u_v__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "u'v'.csi.2.5m",
    "units": "(m/s)^2"
  },
  "u_v__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "u'v'.csi.5.7m",
    "units": "(m/s)^2"
  },
  "u_v__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "u'v'.csi.eol",
    "units": "(m/s)^2"
  },
  "u_w__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "u'w'.csi.24m",
    "units": "(m/s)^2"
  },
  "u_w__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "u'w'.csi.2.5m",
    "units": "(m/s)^2"
  },
  "u_w__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "u'w'.csi.5.7m",
    "units": "(m/s)^2"
  },
  "u_w__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "u'w'.csi.eol",
    "units": "(m/s)^2"
  },
  "v_co2___csi_eol_li7200_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7200",
    "long_name": "2nd moment",
    "short_name": "v'co2'.(csi.eol,li7200)",
    "units": "m/s V"
  },
  "v_co2___csi_eol_li7500a_21_5m_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7500a_21m",
    "long_name": "2nd moment",
    "short_name": "v'co2'.(csi.eol,li7500a.21.5m)",
    "units": "m/s V"
  },
  "v_csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "short_name": "v.csi.24m",
    "units": "m/s"
  },
  "v_csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "short_name": "v.csi.2.5m",
    "units": "m/s"
  },
  "v_csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "short_name": "v.csi.5.7m",
    "units": "m/s"
  },
  "v_csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "short_name": "v.csi.eol",
    "units": "m/s"
  },
  "v_h2o___csi_eol_li7200_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7200",
    "long_name": "2nd moment",
    "short_name": "v'h2o'.(csi.eol,li7200)",
    "units": "m/s V"
  },
  "v_h2o___csi_eol_li7500a_21_5m_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7500a_21m",
    "long_name": "2nd moment",
    "short_name": "v'h2o'.(csi.eol,li7500a.21.5m)",
    "units": "m/s V"
  },
  "v_tc__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "v'tc'.csi.24m",
    "units": "m/s C"
  },
  "v_tc__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "v'tc'.csi.2.5m",
    "units": "m/s C"
  },
  "v_tc__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "v'tc'.csi.5.7m",
    "units": "m/s C"
  },
  "v_tc__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "v'tc'.csi.eol",
    "units": "m/s C"
  },
  "v_v__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "v'v'.csi.24m",
    "units": "(m/s)^2"
  },
  "v_v__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "v'v'.csi.2.5m",
    "units": "(m/s)^2"
  },
  "v_v__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "v'v'.csi.5.7m",
    "units": "(m/s)^2"
  },
  "v_v__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "v'v'.csi.eol",
    "units": "(m/s)^2"
  },
  "v_w__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "v'w'.csi.24m",
    "units": "(m/s)^2"
  },
  "v_w__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "v'w'.csi.2.5m",
    "units": "(m/s)^2"
  },
  "v_w__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "v'w'.csi.5.7m",
    "units": "(m/s)^2"
  },
  "v_w__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "v'w'.csi.eol",
    "units": "(m/s)^2"
  },
  "w_co2___csi_eol_li7200_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7200",
    "long_name": "2nd moment",
    "short_name": "w'co2'.(csi.eol,li7200)",
    "units": "m/s V"
  },
  "w_co2___csi_eol_li7500a_21_5m_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_co2_li7500a_21m",
    "long_name": "2nd moment",
    "short_name": "w'co2'.(csi.eol,li7500a.21.5m)",
    "units": "m/s V"
  },
  "w_csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "short_name": "w.csi.24m",
    "units": "m/s"
  },
  "w_csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "short_name": "w.csi.2.5m",
    "units": "m/s"
  },
  "w_csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "short_name": "w.csi.5.7m",
    "units": "m/s"
  },
  "w_csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "short_name": "w.csi.eol",
    "units": "m/s"
  },
  "w_dir_16m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "w.dir.16m",
    "units": "mV"
  },
  "w_dir_25m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "w.dir.25m",
    "units": "mV"
  },
  "w_h2o___csi_eol_li7200_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7200",
    "long_name": "2nd moment",
    "short_name": "w'h2o'.(csi.eol,li7200)",
    "units": "m/s V"
  },
  "w_h2o___csi_eol_li7500a_21_5m_": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_h2o_li7500a_21m",
    "long_name": "2nd moment",
    "short_name": "w'h2o'.(csi.eol,li7500a.21.5m)",
    "units": "m/s V"
  },
  "w_spd_16m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "w.spd.16m",
    "units": "mV"
  },
  "w_spd_25m": {
    "_FillValue": 9.999999933815813e+36,
    "short_name": "w.spd.25m",
    "units": "mV"
  },
  "w_tc__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "w'tc'.csi.24m",
    "units": "m/s C"
  },
  "w_tc__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "w'tc'.csi.2.5m",
    "units": "m/s C"
  },
  "w_tc__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "w'tc'.csi.5.7m",
    "units": "m/s C"
  },
  "w_tc__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "w'tc'.csi.eol",
    "units": "m/s C"
  },
  "w_w__csi_24m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_24m",
    "long_name": "2nd moment",
    "short_name": "w'w'.csi.24m",
    "units": "(m/s)^2"
  },
  "w_w__csi_2_5m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_2_5m",
    "long_name": "2nd moment",
    "short_name": "w'w'.csi.2.5m",
    "units": "(m/s)^2"
  },
  "w_w__csi_5_7m": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_5_7m",
    "long_name": "2nd moment",
    "short_name": "w'w'.csi.5.7m",
    "units": "(m/s)^2"
  },
  "w_w__csi_eol": {
    "_FillValue": 9.999999933815813e+36,
    "counts": "counts_csi_eol",
    "long_name": "2nd moment",
    "short_name": "w'w'.csi.eol",
    "units": "(m/s)^2"
  }
});
const AQ_NR1_FIELDS = Object.freeze(['air_temperature_c', 'sonic_temperature_c', 'vertical_velocity_ms']);
const AQ_NR1_NATIVE_HEADERS = Object.freeze(['timestamp_utc', 'timestamp_local', 'source_file']
  .concat(Object.keys(AQ_NR1_VARIABLE_METADATA), ['ingested_at_utc']));
const AQ_NR1_HEADERS = Object.freeze(['timestamp_utc', 'timestamp_local', 'observation_count',
  'expected_observation_count', 'coverage_fraction', 'source_file', 'native_samples_json']
  .concat(AQ_NR1_FIELDS, AQ_NR1_FIELDS.map(function(f) { return f + '_observation_count'; })));
const AQ_NR1_MASTER_HEADERS = Object.freeze(['nr1_present', 'nr1_observation_count',
  'nr1_coverage_fraction'].concat(AQ_NR1_FIELDS.map(function(f) { return 'nr1_' + f; })));
const AQ_NR1_CAVEAT = 'US-NR1: preliminary raw 5-minute statistics, not final AmeriFlux products. '
  + 'Subalpine forest near 10000 ft vs home near 7300 ft; regional forest-atmosphere comparator, '
  + 'never local meteorology or a replacement for Tempest/NCAR. Sonic instrument coordinates, '
  + 'no tilt correction/rotation. No validated QC screening. VOC associations establish neither source nor causation. '
  + '15min means of available 5min means; second moments/QC preserved as ordered native samples, '
  + 'not pooled 15min variance/covariance. No direction, u*, stability or final flux derivations.';

/** Set NR1_IMPORT_FILE_ID to one generated daily JSON file uploaded to private Drive. */
function importUsNr1Batch() {
  const id = aqProperties_().getProperty('NR1_IMPORT_FILE_ID');
  if (!id) throw new Error('Set NR1_IMPORT_FILE_ID to a reviewed daily US-NR1 JSON file.');
  const batch = JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString());
  const checked = aqValidateNr1Batch_(batch); // Validate fully before any writes.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Collector busy; retry.');
  try {
    aqEnsureSheet_(AQ_SHEETS.NR1_NATIVE, AQ_NR1_NATIVE_HEADERS);
    aqEnsureSheet_(AQ_SHEETS.NR1, AQ_NR1_HEADERS);
    aqEnsureSheet_(AQ_SHEETS.MASTER, AQ_MASTER_HEADERS);
    aqUpsertRows_(AQ_SHEETS.NR1_NATIVE, AQ_NR1_NATIVE_HEADERS, checked.native);
    aqUpsertRows_(AQ_SHEETS.NR1, AQ_NR1_HEADERS, checked.quarters);
    // Update only new NR1 columns on existing master rows; never rebuild historical sources.
    const master = aqSpreadsheet_().getSheetByName(AQ_SHEETS.MASTER);
    const index = aqIndexRows_(checked.quarters);
    const count = master.getLastRow() - 1;
    const boundary = AQ_MASTER_HEADERS.indexOf('nr1_present') + 1;
    if (count > 0) {
      const keys = master.getRange(2, 1, count, 1).getDisplayValues();
      const values = master.getRange(2, boundary, count, AQ_NR1_MASTER_HEADERS.length).getValues();
      keys.forEach(function(key, i) {
        if (index[key[0]]) values[i] = aqNr1MasterValues_(index[key[0]]);
      });
      master.getRange(2, boundary, count, AQ_NR1_MASTER_HEADERS.length).setValues(values);
    }
    aqWriteReadme_();
    aqWriteSchema_();
    SpreadsheetApp.flush();
    return {native: checked.native.length, quarters: checked.quarters.length};
  } finally { lock.releaseLock(); }
}

function aqNr1MasterValues_(row) {
  return [Boolean(row), row ? row.observation_count : 0, row ? row.coverage_fraction : 0]
    .concat(AQ_NR1_FIELDS.map(function(f) { return row ? row[f] : null; }));
}

function aqValidateNr1Batch_(batch) {
  if (!batch || batch.source !== 'us_nr1' || batch.version !== 1 ||
      !Array.isArray(batch.native) || batch.native.length !== 288 ||
      !Array.isArray(batch.quarters) || batch.quarters.length !== 96) throw new Error('Invalid NR1 daily batch');
  const day = batch.native[0].timestamp_utc.slice(0, 10);
  const midnight = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(midnight)) throw new Error('Invalid NR1 date');
  const file = 'niwot_' + day.replace(/-/g, '') + '.nc';
  batch.native.forEach(function(row, i) {
    if (row.timestamp_utc !== new Date(midnight + (150 + i * 300) * 1000).toISOString().replace('.000Z', 'Z') || row.source_file !== file) throw new Error('Invalid NR1 time/source');
    Object.keys(AQ_NR1_VARIABLE_METADATA).forEach(function(f) {
      if (row[f] !== null && (typeof row[f] !== 'number' || !Number.isFinite(row[f]) || Math.abs(row[f]) >= 1e36)) throw new Error('Invalid NR1 number: ' + f);
    });
    row.timestamp_local = aqLocalIso_(new Date(row.timestamp_utc), 'America/Denver');
  });
  // Recompute trusted scalar bins from native inputs; never trust supplied aggregates.
  const quarters = [];
  for (let i = 0; i < 96; i += 1) {
    const samples = batch.native.slice(i * 3, i * 3 + 3);
    const stamp = new Date(midnight + i * 900000);
    const row = {timestamp_utc: aqUtcIso_(stamp), timestamp_local: aqLocalIso_(stamp, 'America/Denver'),
      observation_count: 3, expected_observation_count: 3, coverage_fraction: 1,
      source_file: file, native_samples_json: JSON.stringify(samples.map(function(sample) {
        const selected = {};
        Object.keys(sample).forEach(function(k) {
          if (['timestamp_utc', 'timestamp_local', 'source_file', 'ingested_at_utc', 'T3_21m', 'diag', 'GPSstat_niwot', 'GPSnsat_niwot', 'Stratum', 'Timeoffset', 'status_ec'].indexOf(k) >= 0 || /csi_24m$/.test(k) || /^counts_/.test(k) || /diag/.test(k)) selected[k] = sample[k];
        });
        return selected;
      }))};
    const sources = ['T3_21m', 'tc_csi_24m', 'w_csi_24m'];
    AQ_NR1_FIELDS.forEach(function(f, j) {
      const values = samples.map(function(s) { return s[sources[j]]; }).filter(function(v) { return v !== null; });
      row[f] = values.length ? values.reduce(function(a, b) { return a + b; }, 0) / values.length : null;
      row[f + '_observation_count'] = values.length;
    });
    quarters.push(row);
  }
  return {native: batch.native, quarters: quarters};
}

function aqNr1SchemaDefinition_(table, column) {
  const raw = AQ_NR1_VARIABLE_METADATA[column];
  const field = column.replace(/^nr1_/, '');
  let type = raw ? 'number' : 'text';
  let unit = raw ? (raw.units || '') : '';
  let description = raw ? 'Exact source metadata: ' + JSON.stringify(raw) + '. ' : '';
  if (column === 'timestamp_utc' || column === 'timestamp_local' || column === 'ingested_at_utc') {
    type = 'timestamp';
    unit = column === 'timestamp_local' ? 'America/Denver' : 'UTC';
    description = column === 'ingested_at_utc' ? 'Stable ingestion time for unchanged source files. '
      : table === AQ_SHEETS.NR1_NATIVE ? 'Center of native 300-second statistic; local time is DST-aware. '
      : 'Canonical quarter-hour UTC bin start; local time is DST-aware. ';
  } else if (AQ_NR1_FIELDS.indexOf(field) >= 0) {
    type = 'number';
    unit = field === 'vertical_velocity_ms' ? 'm/s' : 'C';
    description = 'Mean of available equal-duration 5-minute means from '
      + ({air_temperature_c: 'T3_21m (above-canopy air temperature)',
        sonic_temperature_c: 'tc_csi_24m (sonic temperature)',
        vertical_velocity_ms: 'w_csi_24m (instrument-axis w, not corrected vertical flow)'})[field] + '. ';
  } else if (field === 'present') {
    type = 'boolean';
    description = 'Native records exist in this bin; not QC approval. ';
  } else if (/observation_count/.test(field)) {
    type = 'integer';
    unit = 'records';
    description = field === 'expected_observation_count' ? 'Expected three 5-minute records. '
      : field === 'observation_count' ? 'Available native records, independent of validity or QC. '
      : 'Nonmissing native values used in this field mean. ';
  } else if (field === 'coverage_fraction') {
    type = 'number'; unit = 'fraction'; description = 'Native record count / 3, not QC approval. ';
  } else if (column === 'native_samples_json') {
    type = 'JSON';
    description = 'Three ordered selected native 24m sonic statistics, T3_21m, sample counts, diagnostics '
      + 'and clock QC. Not pooled/averaged moments. Full variable inventory in US_NR1_5min. ';
  } else if (column === 'source_file') {
    description = 'Original daily NetCDF basename. ';
  }
  return [type, unit, description + AQ_NR1_CAVEAT,
    'Blank/null means unavailable; source fill ~1e37 and count fill 0 are masked. Record coverage is not QC approval.'];
}
