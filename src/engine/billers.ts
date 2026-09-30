/* Utility billers across India: electricity boards, water boards, LPG and piped gas. Used by the keyword
   rules (rules.ts). Each entry is a whole word in the narration unless noted. Grouped by state so a missing
   board is easy to spot and add. Generic words (ELECTRICITY, WATER, GAS) are already in rules.ts. */

const ELECTRICITY = [
  // Rajasthan
  'JDVVNL', 'AVVNL', 'JVVNL',
  // Delhi
  'BSES', 'BRPL', 'BYPL', 'TPDDL', 'NDMC',
  // Uttar Pradesh
  'UPPCL', 'PVVNL', 'MVVNL', 'DVVNL', 'PUVVNL', 'KESCO', 'NPCL',
  // Maharashtra
  'MSEDCL', 'MAHADISCOM', 'MAHAVITARAN', 'TATA POWER', 'ADANI ELECTRICITY', 'AEML',
  // Gujarat
  'PGVCL', 'UGVCL', 'MGVCL', 'DGVCL', 'TORRENT POWER',
  // Madhya Pradesh, Chhattisgarh
  'MPPKVVCL', 'MPMKVVCL', 'MPPGVVCL', 'MPEZ', 'MPCZ', 'MPWZ', 'CSPDCL',
  // Karnataka, Kerala
  'BESCOM', 'MESCOM', 'HESCOM', 'GESCOM', 'CHESCOM', 'CESCOM', 'KSEB',
  // Tamil Nadu, Puducherry
  'TNEB', 'TANGEDCO', 'TNPDCL', 'PED PUDUCHERRY',
  // Andhra Pradesh, Telangana
  'APSPDCL', 'APEPDCL', 'APCPDCL', 'TSSPDCL', 'TSNPDCL', 'TGSPDCL', 'TGNPDCL',
  // West Bengal, Odisha, Bihar, Jharkhand
  'WBSEDCL', 'CESC', 'TPCODL', 'TPSODL', 'TPWODL', 'TPNODL', 'CESU', 'NBPDCL', 'SBPDCL', 'JBVNL',
  // Punjab, Haryana, Himachal, Uttarakhand, J&K, Chandigarh
  'PSPCL', 'UHBVN', 'UHBVNL', 'DHBVN', 'DHBVNL', 'HPSEB', 'HPSEBL', 'UPCL', 'JKPDD', 'JPDCL', 'KPDCL',
  // North-east
  'APDCL', 'MEPDCL', 'TSECL', 'MSPDCL', 'DOPN', 'NEEPCO',
  // Words owners and banks use for the electricity bill
  'BIJLI', 'LIGHT BILL', 'POWER BILL', 'ELECTRICITY BOARD',
];

const WATER = [
  'JAL', // Delhi Jal Board, UP Jal Nigam, Jal Sansthan
  'BWSSB', 'HMWSSB', 'CMWSSB', 'KWA', 'PHED', 'WATER WORKS', 'NAGAR NIGAM WATER',
];

const GAS = [
  'LPG', 'INDANE', 'HPGAS', 'HP GAS', 'BHARATGAS', 'BHARAT GAS', 'GAS AGENCY', 'CYLINDER', 'PNG',
  'IGL', 'MGL', 'MNGL', 'GAIL GAS', 'GUJARAT GAS', 'ADANI TOTAL GAS', 'TORRENT GAS', 'PIPED GAS',
];

/** A whole word in the (upper-case) narration. Spaces inside a name are optional (HP GAS / HPGAS), and a
    name may run straight into POWER, BILL or LTD (BILL/AVVNLPOWER), but never into other letters, so
    JAL does not match JALAN TRADERS. */
const alternation = [...ELECTRICITY, ...WATER, ...GAS].map((w) => w.replace(/ /g, ' ?')).join('|');
export const BILLER_PATTERN = new RegExp(`(?:^|[^A-Z])(?:${alternation})(?:POWER|BILL|LTD)?(?![A-Z])`);

export const BILLER_NAMES = { ELECTRICITY, WATER, GAS } as const;
