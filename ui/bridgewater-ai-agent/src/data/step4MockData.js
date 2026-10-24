// ── Step 4: Modeling Workspace mock data ──────────────────────────────────────
// Keyed by ticker. All scenario outputs are pre-computed; in-browser recompute
// uses a simplified formula when the analyst edits parameters.

// ── Shared model catalog ───────────────────────────────────────────────────────
export const MODEL_CATALOG = [
  {
    id:          'scenario-valuation',
    label:       'Scenario-Based Valuation',
    description: 'Bull / Base / Bear cases with adjustable assumptions and weighted fair value output.',
    status:      'active',   // 'active' | 'coming-soon' | 'experimental' | 'placeholder'
  },
  {
    id:          'comparable-valuation',
    label:       'Comparable Valuation',
    description: 'Peer-group EV/EBITDA and P/E multiples anchored to selected comps.',
    status:      'coming-soon',
  },
  {
    id:          'sensitivity-model',
    label:       'Sensitivity Model',
    description: 'Single-variable and multi-variable sensitivity tables across key drivers.',
    status:      'coming-soon',
  },
  {
    id:          'neural-network',
    label:       'Neural Network Forecast',
    description: 'Experimental deep-learning price forecast. Not for primary investment decisions.',
    status:      'experimental',
  },
  {
    id:          'custom-model',
    label:       'Custom Model',
    description: 'Upload your own model template or build from scratch.',
    status:      'placeholder',
  },
];

// ── Per-ticker data ────────────────────────────────────────────────────────────

export const step4MockData = {

  // ─────────────────────────────── TSLA ────────────────────────────────────────
  TSLA: {
    currentPrice: 245.50,
    baseRevenue:  97.7,   // TTM revenue in $B — used in simplified recompute formula

    baselineParams: {
      revenueGrowth:   { bull: 25,   base: 12,   bear: -5,  unit: '%', label: 'Revenue Growth (YoY)',    description: 'Top-line growth driven by Model 2 ramp and energy storage' },
      grossMargin:     { bull: 20.0, base: 17.1, bear: 13.0,unit: '%', label: 'Gross Margin',            description: 'Impacted by vehicle price cuts and mix shift' },
      operatingMargin: { bull: 12.0, base: 8.2,  bear: 3.0, unit: '%', label: 'Operating Margin',        description: 'SG&A and R&D leverage against revenue scale' },
      wacc:            { bull: 9.0,  base: 10.5, bear: 12.5,unit: '%', label: 'WACC / Discount Rate',    description: 'Reflects EV sector risk premium and balance sheet strength' },
      terminalGrowth:  { bull: 4.0,  base: 3.0,  bear: 2.0, unit: '%', label: 'Terminal Growth Rate',    description: 'Long-run growth anchored to GDP + EV penetration tailwind' },
      exitMultiple:    { bull: 35,   base: 28,   bear: 18,  unit: 'x', label: 'Exit EV/EBITDA Multiple', description: 'Premium to peers on FSD and energy optionality' },
      scenarioWeights: { bull: 25,   base: 55,   bear: 20,  unit: '%', label: 'Scenario Weights',        description: 'Analyst-assigned probability to each case' },
    },

    scenarioOutputs: {
      bull: { fairValue: 385, label: 'Bull Case' },
      base: { fairValue: 268, label: 'Base Case' },
      bear: { fairValue: 142, label: 'Bear Case' },
      weighted: 272,
    },

    // 5 rows = terminal growth [2.0, 2.5, 3.0, 3.5, 4.0]
    // 5 cols = WACC           [9.0, 10.0, 10.5, 11.0, 12.0]
    sensitivityGrid: {
      rowLabels: [4.0, 3.5, 3.0, 2.5, 2.0],
      colLabels: [9.0, 10.0, 10.5, 11.0, 12.0],
      values: [
        [338, 305, 290, 276, 252],
        [318, 287, 272, 259, 236],
        [298, 268, 254, 241, 220],
        [278, 250, 237, 225, 205],
        [258, 232, 220, 209, 190],
      ],
    },

    driverContributions: [
      { label: 'Core DCF',           value: 185, type: 'base'     },
      { label: 'FSD Optionality',    value:  48, type: 'positive' },
      { label: 'Energy Storage',     value:  35, type: 'positive' },
      { label: 'Margin Compression', value: -28, type: 'negative' },
      { label: 'China Risk Disc.',   value: -15, type: 'negative' },
      { label: 'Robotaxi Premium',   value:  23, type: 'positive' },
      { label: 'Fair Value',         value: 268, type: 'result'   },
    ],

    insights: {
      whyThisModel:
        'Scenario-Based Valuation is preferred because Tesla\'s fair value is heavily path-dependent on FSD monetisation and energy storage. A single-point DCF would obscure the wide range of plausible outcomes. Assigning explicit probabilities to Bull/Base/Bear cases forces clarity about key assumptions.',
      keyAssumptions: [
        { label: 'Model 2 ramp on schedule (H1 2025)',          rationale: 'Management guidance; supplier checks corroborate timing' },
        { label: 'FSD revenue recognised as software licensing', rationale: 'Regulatory approval in California is the key gate' },
        { label: 'Energy storage exits year 5 at 20% EBIT margin', rationale: 'Megapack demand backlog supports pricing discipline' },
      ],
      biggestUncertainty:
        'Gross margin trajectory following further vehicle price reductions. Each 100bps of gross margin compression reduces Base fair value by approximately $12.',
      invalidationCondition:
        'BYD achieves >15% North American EV market share by 2026, forcing a second round of price reductions that compress gross margin below 13% — triggering the Bear case.',
    },

    summary: {
      weightedFairValue: 272,
      currentPrice:      245.50,
      upside:            10.8,
      mostSensitiveVar:  'WACC / Discount Rate',
      confidenceScore:   68,
      recommendedAction: 'Initiate position sizing analysis. Stress-test Bear case probability before committing to a full position. Revisit after Q3 earnings gross margin disclosure.',
    },
  },

  // ─────────────────────────────── AAPL ────────────────────────────────────────
  AAPL: {
    currentPrice: 227.50,
    baseRevenue:  391.0,

    baselineParams: {
      revenueGrowth:   { bull: 12,   base: 7,    bear: 2,   unit: '%', label: 'Revenue Growth (YoY)',    description: 'iPhone cycle + Services acceleration from Apple Intelligence' },
      grossMargin:     { bull: 47.5, base: 45.5, bear: 42.0,unit: '%', label: 'Gross Margin',            description: 'Services mix shift structurally expands blended margins' },
      operatingMargin: { bull: 33.0, base: 30.5, bear: 27.0,unit: '%', label: 'Operating Margin',        description: 'Stable opex leverage; R&D investment in AI maintained' },
      wacc:            { bull: 8.5,  base: 9.5,  bear: 11.0,unit: '%', label: 'WACC / Discount Rate',    description: 'Low beta, fortress balance sheet, AA+ credit rating' },
      terminalGrowth:  { bull: 4.0,  base: 3.0,  bear: 2.0, unit: '%', label: 'Terminal Growth Rate',    description: 'Anchored to global GDP with Services platform premium' },
      exitMultiple:    { bull: 30,   base: 25,   bear: 18,  unit: 'x', label: 'Exit EV/EBITDA Multiple', description: 'Software-like Services multiple blended with hardware comps' },
      scenarioWeights: { bull: 30,   base: 55,   bear: 15,  unit: '%', label: 'Scenario Weights',        description: 'Lower Bear probability given capital return programme' },
    },

    scenarioOutputs: {
      bull: { fairValue: 295, label: 'Bull Case' },
      base: { fairValue: 242, label: 'Base Case' },
      bear: { fairValue: 165, label: 'Bear Case' },
      weighted: 252,
    },

    sensitivityGrid: {
      rowLabels: [4.0, 3.5, 3.0, 2.5, 2.0],
      colLabels: [8.5, 9.0, 9.5, 10.0, 11.0],
      values: [
        [275, 260, 248, 236, 215],
        [262, 248, 236, 225, 205],
        [250, 236, 225, 214, 195],
        [238, 225, 214, 204, 186],
        [227, 215, 204, 194, 177],
      ],
    },

    driverContributions: [
      { label: 'Core DCF',             value: 185, type: 'base'     },
      { label: 'Services Premium',     value:  42, type: 'positive' },
      { label: 'AI Monetisation',      value:  28, type: 'positive' },
      { label: 'China Market Risk',    value: -18, type: 'negative' },
      { label: 'Regulatory Discount',  value: -10, type: 'negative' },
      { label: 'Capital Return Uplift',value:  15, type: 'positive' },
      { label: 'Fair Value',           value: 242, type: 'result'   },
    ],

    insights: {
      whyThisModel:
        'Apple\'s mature, predictable cash flow profile makes scenario analysis the right frame. The wide bull/bear spread (65%) is driven almost entirely by Services margin outcomes and China demand — two variables that are binary in nature and warrant explicit probability weighting.',
      keyAssumptions: [
        { label: 'Apple Intelligence drives 8% ARPU uplift in Services by FY26', rationale: 'Early adoption data from iOS 18.1 rollout is the leading indicator' },
        { label: 'App Store regulatory impact capped at 3% revenue reduction',   rationale: 'EU DMA compliance changes; litigation risk remains but is bounded' },
        { label: 'iPhone unit volumes flat in China; no further share loss',      rationale: 'Conservative vs historical share; Huawei resurgence is the key risk' },
      ],
      biggestUncertainty:
        'Services margin sustainability if regulatory changes force third-party payment processing at scale. A 200bps margin compression in Services reduces Base fair value by approximately $18.',
      invalidationCondition:
        'EU forces structural separation of App Store payments, compressing Services EBIT margin below 38% — a scenario that breaks the Services platform multiple assumption.',
    },

    summary: {
      weightedFairValue: 252,
      currentPrice:      227.50,
      upside:            10.8,
      mostSensitiveVar:  'Services Gross Margin',
      confidenceScore:   81,
      recommendedAction: 'Model is conviction-ready for Base case. Run the Services margin sensitivity before finalising position size. Monitor EU DMA implementation timeline closely.',
    },
  },

  // ─────────────────────────────── NVDA ────────────────────────────────────────
  NVDA: {
    currentPrice: 875.00,
    baseRevenue:  79.8,

    baselineParams: {
      revenueGrowth:   { bull: 90,   base: 55,   bear: 20,  unit: '%', label: 'Revenue Growth (YoY)',    description: 'Blackwell ramp + sovereign AI demand driving upside' },
      grossMargin:     { bull: 78.0, base: 74.5, bear: 68.0,unit: '%', label: 'Gross Margin',            description: 'Structurally high due to CUDA software component of revenue' },
      operatingMargin: { bull: 65.0, base: 59.0, bear: 48.0,unit: '%', label: 'Operating Margin',        description: 'High incremental margins on data centre revenue scale' },
      wacc:            { bull: 9.5,  base: 11.0, bear: 13.0,unit: '%', label: 'WACC / Discount Rate',    description: 'Elevated vs peers given hypergrowth risk and geopolitical exposure' },
      terminalGrowth:  { bull: 5.0,  base: 4.0,  bear: 2.5, unit: '%', label: 'Terminal Growth Rate',    description: 'AI infrastructure as secular multi-decade growth category' },
      exitMultiple:    { bull: 45,   base: 35,   bear: 22,  unit: 'x', label: 'Exit EV/EBITDA Multiple', description: 'Reflects software-like ecosystem lock-in via CUDA' },
      scenarioWeights: { bull: 35,   base: 50,   bear: 15,  unit: '%', label: 'Scenario Weights',        description: 'Elevated Bull weight given order backlog visibility' },
    },

    scenarioOutputs: {
      bull: { fairValue: 1350, label: 'Bull Case' },
      base: { fairValue:  940, label: 'Base Case' },
      bear: { fairValue:  510, label: 'Bear Case' },
      weighted: 1010,
    },

    sensitivityGrid: {
      rowLabels: [5.0, 4.5, 4.0, 3.5, 2.5],
      colLabels: [9.5, 10.0, 11.0, 12.0, 13.0],
      values: [
        [1120, 1048, 942,  855,  762 ],
        [1055, 988,  890,  809,  722 ],
        [ 990, 928,  838,  762,  681 ],
        [ 928, 870,  786,  715,  640 ],
        [ 812, 762,  690,  628,  562 ],
      ],
    },

    driverContributions: [
      { label: 'Core DCF',           value:  620, type: 'base'     },
      { label: 'Blackwell Premium',  value:  185, type: 'positive' },
      { label: 'CUDA Ecosystem',     value:  142, type: 'positive' },
      { label: 'Sovereign AI Uplift',value:   95, type: 'positive' },
      { label: 'Export Control Disc',value: -102, type: 'negative' },
      { label: 'Custom ASIC Risk',   value:  -58, type: 'negative' },
      { label: 'Supply Constraint',  value:   58, type: 'positive' },
      { label: 'Fair Value',         value:  940, type: 'result'   },
    ],

    insights: {
      whyThisModel:
        'Nvidia\'s growth trajectory is so non-linear that a single DCF is unreliable. Scenario weighting with an elevated Bull probability (35%) reflects the order backlog and sovereign AI demand that provide near-term revenue visibility beyond the typical forecast horizon.',
      keyAssumptions: [
        { label: 'Blackwell GPU production reaches 300K units/quarter by Q2 FY26', rationale: 'TSMC CoWoS packaging capacity is the binding constraint; current expansion on track' },
        { label: 'Hyperscaler AI capex sustains >$200B annually through 2026',     rationale: 'Microsoft, Google, Meta guidance; any capex pullback is the primary Bear trigger' },
        { label: 'CUDA switching costs persist — AMD gains <15% inference share',  rationale: 'Developer toolchain lock-in; PyTorch / TensorFlow default CUDA acceleration' },
      ],
      biggestUncertainty:
        'Speed of hyperscaler custom ASIC adoption (Google TPU v5, AWS Trainium 2). Each 5% shift in data centre revenue share to custom silicon reduces Base fair value by approximately $45.',
      invalidationCondition:
        'US export controls expand to cover A100-class chips for all non-allied nations, cutting total addressable market by 30% and triggering a demand reset in the Bear case.',
    },

    summary: {
      weightedFairValue: 1010,
      currentPrice:      875.00,
      upside:            15.4,
      mostSensitiveVar:  'Revenue Growth Rate',
      confidenceScore:   88,
      recommendedAction: 'Strong Buy signal from weighted model. Key gate before adding to position: Blackwell production ramp confirmation in Q1 FY26 earnings call. Size relative to export control tail risk.',
    },
  },

  // ─────────────────────────────── DEFAULT ─────────────────────────────────────
  DEFAULT: {
    currentPrice: 100.00,
    baseRevenue:  10.0,

    baselineParams: {
      revenueGrowth:   { bull: 15,   base: 8,    bear: 0,   unit: '%', label: 'Revenue Growth (YoY)',    description: 'Submit a company in Step 1 to load AI-recommended assumptions' },
      grossMargin:     { bull: 45,   base: 38,   bear: 28,  unit: '%', label: 'Gross Margin',            description: 'Sector-average placeholder' },
      operatingMargin: { bull: 20,   base: 14,   bear: 5,   unit: '%', label: 'Operating Margin',        description: 'Sector-average placeholder' },
      wacc:            { bull: 9,    base: 10,   bear: 12,  unit: '%', label: 'WACC / Discount Rate',    description: 'Generic market risk premium' },
      terminalGrowth:  { bull: 3.5,  base: 2.5,  bear: 1.5, unit: '%', label: 'Terminal Growth Rate',    description: 'GDP-aligned placeholder' },
      exitMultiple:    { bull: 25,   base: 18,   bear: 12,  unit: 'x', label: 'Exit EV/EBITDA Multiple', description: 'Broad market median' },
      scenarioWeights: { bull: 25,   base: 50,   bear: 25,  unit: '%', label: 'Scenario Weights',        description: 'Equal-weight default' },
    },

    scenarioOutputs: {
      bull: { fairValue: 145, label: 'Bull Case' },
      base: { fairValue: 105, label: 'Base Case' },
      bear: { fairValue:  68, label: 'Bear Case' },
      weighted: 108,
    },

    sensitivityGrid: {
      rowLabels: [3.5, 3.0, 2.5, 2.0, 1.5],
      colLabels: [9.0, 10.0, 10.5, 11.0, 12.0],
      values: [
        [122, 112, 107, 102,  93],
        [115, 106, 101,  96,  88],
        [108,  99,  95,  90,  82],
        [101,  93,  89,  84,  77],
        [ 95,  87,  83,  79,  72],
      ],
    },

    driverContributions: [
      { label: 'Core DCF',         value:  88, type: 'base'     },
      { label: 'Growth Premium',   value:  22, type: 'positive' },
      { label: 'Risk Discount',    value: -12, type: 'negative' },
      { label: 'Market Premium',   value:   7, type: 'positive' },
      { label: 'Fair Value',       value: 105, type: 'result'   },
    ],

    insights: {
      whyThisModel:
        'Default scenario model loaded. Submit a specific company in Step 1 to generate AI-recommended parameters tailored to the target\'s sector and competitive position.',
      keyAssumptions: [
        { label: 'Generic sector-average inputs applied', rationale: 'Identify a company to unlock targeted AI assumptions' },
      ],
      biggestUncertainty: 'Company not identified — all assumptions are generic placeholders.',
      invalidationCondition: 'Not applicable until a company is identified.',
    },

    summary: {
      weightedFairValue: 108,
      currentPrice:      100.00,
      upside:            8.0,
      mostSensitiveVar:  'WACC / Discount Rate',
      confidenceScore:   40,
      recommendedAction: 'Return to Step 1 and submit a specific company to unlock a targeted modeling workspace.',
    },
  },
};

// ── Simplified in-browser recompute formula ────────────────────────────────────
// Called when analyst edits any parameter. Returns updated { bull, base, bear, weighted }.
// Not a real DCF — a plausible approximation that responds sensibly to input changes.
export function recomputeScenarios(baseRevenue, params, currentOutputs) {
  const compute = (scenario) => {
    const g   = (params.revenueGrowth[scenario]   ?? 0) / 100;
    const om  = (params.operatingMargin[scenario] ?? 0) / 100;
    const em  = params.exitMultiple[scenario]      ?? 1;
    const w   = (params.wacc[scenario]             ?? 10) / 100;
    const tg  = (params.terminalGrowth[scenario]  ?? 2)  / 100;
    const yrs = 5;

    // Project year-5 revenue
    const rev5  = baseRevenue * Math.pow(1 + g, yrs);
    // Terminal value (Gordon growth on EBIT)
    const ebit5 = rev5 * om;
    const tv    = (ebit5 * (1 + tg)) / Math.max(0.001, w - tg);
    // Simple equity bridge: EV proxy = TV + exit multiple × EBIT5 normalised
    const fv    = (tv / 2 + ebit5 * em) / 2;
    // Anchor close to original to keep numbers in range
    const anchor = currentOutputs[scenario]?.fairValue ?? fv;
    return Math.round(anchor * 0.5 + fv * 0.5);
  };

  const bull = compute('bull');
  const base = compute('base');
  const bear = compute('bear');

  const bw = (params.scenarioWeights.bull ?? 25) / 100;
  const aw = (params.scenarioWeights.base ?? 55) / 100;
  const ew = (params.scenarioWeights.bear ?? 20) / 100;
  const weighted = Math.round(bull * bw + base * aw + bear * ew);

  return { bull, base, bear, weighted };
}
