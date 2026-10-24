// Mock data for roles, workflow, and research process

export const roles = [
  {
    id: 'junior-analyst',
    title: 'Junior Analyst',
    description: 'Collect source data, inspect evidence, and draft the first research memo for review.',
    color: 'slate',
    bgGradient: 'from-slate-900 to-slate-800',
    borderColor: 'border-slate-700',
    capabilities: ['Data intake', 'Evidence review', 'Draft memo synthesis']
  },
  {
    id: 'senior-analyst',
    title: 'Senior Analyst',
    description: 'Review the junior memo, challenge valuation assumptions, and prepare an action proposal.',
    color: 'indigo',
    bgGradient: 'from-indigo-900 to-indigo-800',
    borderColor: 'border-indigo-700',
    capabilities: ['Model review', 'DCF assumption check', 'Proposal drafting']
  },
  {
    id: 'risk-team',
    title: 'Risk Team',
    description: 'Stress-test the proposal, identify downside triggers, and prepare PM escalation notes.',
    color: 'amber',
    bgGradient: 'from-amber-900 to-amber-800',
    borderColor: 'border-amber-700',
    capabilities: ['Scenario analysis', 'Risk controls', 'PM handoff']
  },
  {
    id: 'portfolio-manager',
    title: 'Portfolio Manager',
    description: 'Review the proposal, pressure-test the decision, and record a local approval decision.',
    color: 'emerald',
    bgGradient: 'from-emerald-900 to-emerald-800',
    borderColor: 'border-emerald-700',
    capabilities: ['Decision review', "Devil's advocate debate", 'Final local decision']
  }
];

export const workflowSteps = [
  {
    step: 1,
    name: 'Junior Analyst',
    description: 'Evidence collection, analysis, and synthesis memo'
  },
  {
    step: 2,
    name: 'Senior Analyst',
    description: 'Model quality review, risk handoff, and trade proposal'
  },
  {
    step: 3,
    name: 'Risk Team',
    description: 'Stress simulation, exposure review, and PM handoff'
  },
  {
    step: 4,
    name: 'Portfolio Manager',
    description: 'Cross-team review, portfolio visualization, and local decision record'
  }
];

export const heroContent = {
  headline: 'AI-Powered Investment Research Workflow',
  subheadline: 'A multi-role workflow for evidence collection, model review, stress testing, and PM decision-making.',
  description: 'Each role hands off structured context to the next — grounded in source-packet analysis, not ad hoc notes. Junior research flows through Senior review, Risk validation, and a final PM decision gate.',
  cta: 'Start Workflow'
};

export const features = [
  {
    title: 'AI-Assisted Research',
    description: 'Packet-grounded drafting, evidence review, and synthesis support'
  },
  {
    title: 'Multi-Role Collaboration',
    description: 'Connected handoffs across analysts, risk teams, and portfolio managers'
  },
  {
    title: 'Scenario & Risk Review',
    description: 'Stress-test overlays, exposure shifts, and PM-ready risk summaries'
  },
  {
    title: 'Human Review Guardrails',
    description: 'Local decisions stay review-only; no trade is routed or executed'
  }
];
