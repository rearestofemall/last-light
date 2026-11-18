/**
 * CONFIG.ts: every balance number in the game lives here.
 * Tweak these to rebalance without touching game logic.
 */
export const CONFIG = {
  currency: 'Rs',

  // ---------------- Time ----------------
  time: {
    gameMinutesPerRealSecond: 4, // at 1x speed
    openHour: 9,
    closeHour: 20,
    speeds: [0, 1, 2, 4, 8],
  },

  // ---------------- Start ----------------
  start: {
    cash: 150_000,
    reputation: 15,
    playerSkill: 20,
    freePlayCash: 99_999_999,
  },

  // ---------------- Repair mechanics ----------------
  repair: {
    heatPerApplication: 34, // heat added per heat-pad use (0..100)
    heatDecayPerMinute: 2.5,
    safeOpenHeat: 60, // below this, opening glued panels is risky
    crackChanceCold: 0.45, // chance to crack the panel opening at 0 heat
    flexTearChance: 0.12, // chance to tear a flex when opening cold / prying
    shortChanceBatteryConnected: 0.35, // chance per risky action while battery connected
    longScrewTolerance: 0.25, // mm. Longer than hole+tolerance damages the board
    screwStripChanceCheap: 0.06,
    adhesivePullFailChance: 0.35,
    minutes: {
      heat: 3, open: 4, screw: 0.5, bracket: 1, connector: 0.5, part: 3, adhesive: 2, close: 3, test: 5, clean: 20, flash: 25,
    },
    missingScrewQualityPenalty: 4,
    mistakeQualityPenalty: 8,
  },

  // ---------------- Microsoldering ----------------
  micro: {
    meltLeadFree: 217,
    meltLeaded: 183,
    burnTemp: 330,
    burnSeconds: 1.2,
    kaptonProtection: 0.25, // fraction of heat that reaches a taped part
    coolRate: 0.9, // per second, fraction of excess over ambient lost
    ambient: 25,
    cheapStationJitter: 40,
    proStationJitter: 4,
    pullUnmeltedPadRipChance: 0.8,
  },

  // ---------------- Parts ----------------
  parts: {
    gradePriceMult: { genuine: 1.0, refurbished: 0.55, aftermarket: 0.28, counterfeit: 0.3 },
    gradeQuality: { genuine: 100, refurbished: 82, aftermarket: 60, counterfeit: 45 },
    gradeWarrantyFailChance: { genuine: 0.02, refurbished: 0.06, aftermarket: 0.14, counterfeit: 0.55 },
    priceDriftPerDay: 0.02,
    spikeMultiplier: 1.6,
    recycleValuePerKgPhone: 450,
    ewasteDisposalCost: 150,
  },

  // ---------------- Customers ----------------
  customers: {
    baseArrivalsPerHour: 0.9,
    patienceMinutes: [45, 160],
    warrantyDays: 30,
    reviewWeight: 1.2,
    acceptQuoteSlack: 0.15, // customer accepts up to budget*(1+slack)
    bargainRounds: 3,
    sameDayBonus: 0.35,
  },

  // ---------------- Pricing ----------------
  pricing: {
    tierMult: { budget: 0.7, mid: 1.0, flagship: 1.6, foldable: 2.3, legacy: 0.8 },
    diagnosticFee: 1_000,
  },

  // ---------------- Economy ----------------
  economy: {
    electricityPerBenchPerDay: 180,
    insurancePlans: [
      { id: 'none', name: 'No insurance', daily: 0, theft: 0, damage: 0 },
      { id: 'basic', name: 'Basic cover', daily: 350, theft: 0.5, damage: 0.5 },
      { id: 'full', name: 'Full cover', daily: 900, theft: 0.9, damage: 0.9 },
    ],
    loanOptions: [
      { amount: 100_000, rate: 0.0015, days: 60 },
      { amount: 500_000, rate: 0.0012, days: 120 },
      { amount: 2_500_000, rate: 0.001, days: 240 },
    ],
    marketDriftPerDay: 0.015,
    phoneDepreciationPerYear: 0.18,
    ptaDiscount: 0.3, // non-PTA phones lose this fraction of value
  },

  // ---------------- Employees ----------------
  employees: {
    baseSalaryPerSkill: 45, // per day per skill point
    moraleDecayPerDay: 1.5,
    trainingCost: 25_000,
    trainingSkillGain: 8,
    dishonestSwapChancePerDay: 0.08,
    walkSpeedTilesPerSec: 3,
    baseRepairMinutes: 90,
  },

  // ---------------- Reputation / progression ----------------
  progression: {
    stages: [
      { id: 1, name: 'Small Repair Booth', rep: 0, repairs: 0, netWorth: 0, research: [] as string[] },
      { id: 2, name: 'Local Repair Shop', rep: 30, repairs: 12, netWorth: 250_000, research: [] as string[] },
      { id: 3, name: 'Professional Service Centre', rep: 50, repairs: 45, netWorth: 900_000, research: ['microsoldering'] },
      { id: 4, name: 'Repair Company', rep: 68, repairs: 120, netWorth: 4_000_000, research: ['business-accounts'] },
      { id: 5, name: 'International Electronics Brand', rep: 82, repairs: 300, netWorth: 20_000_000, research: ['manufacturing'] },
    ],
  },

  // ---------------- Competitors ----------------
  competitors: {
    shareRepExponent: 1.4,
    sharePriceExponent: 2.0,
    priceWarDays: 7,
  },

  // ---------------- Events ----------------
  events: {
    dailyChance: 0.45,
  },

  // ---------------- Modes ----------------
  modes: {
    expert: {
      shortChanceMult: 2,
      damageRiskMult: 1.8,
      partsPriceMult: 1.25,
      patienceMult: 0.7,
      cashMult: 0.6,
    },
  },
};

export type Config = typeof CONFIG;
