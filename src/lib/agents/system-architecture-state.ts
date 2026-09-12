export interface ArchitectureStage {
  id: number;
  code: string;
  title: string;
  subtitle: string;
  color: 'cyan' | 'purple' | 'amber' | 'blue' | 'teal' | 'red' | 'green' | 'gold';
  agentName: string;
  agentRole: string;
  status: 'OPTIMAL' | 'ACTIVE' | 'PROCESSING' | 'ALERT' | 'STANDBY';
  telemetry: {
    label: string;
    value: string | number;
    trend?: 'up' | 'down' | 'neutral';
  }[];
  items: string[];
  lastAction: string;
}

export const ARCHITECTURE_STAGES: ArchitectureStage[] = [
  {
    id: 1,
    code: 'DATA_SOURCES',
    title: '1. DATA SOURCES (ALL INDICATORS)',
    subtitle: '10 Synchronized High-Frequency Ingest Feeds',
    color: 'blue',
    agentName: 'Data Ingest Coordinator Agent',
    agentRole: 'Multi-Asset Stream Polling & Feed Synchronization',
    status: 'OPTIMAL',
    telemetry: [
      { label: 'Active Streams', value: '10 / 10' },
      { label: 'Feed Latency', value: '18ms', trend: 'neutral' },
      { label: 'Ticks Ingested/min', value: '1,420', trend: 'up' },
      { label: 'Provider Cost', value: '$0.00 (Free Feeds)', trend: 'neutral' }
    ],
    items: [
      'XAUUSD Live Price & Market Depth',
      'DXY (US Dollar Index)',
      'US Rates (10Y / 2Y / 30Y Treasury Yields)',
      'Macro Data (GDP, CPI, PCE, NFP, ISM)',
      'Economic Calendar (High/Critical Speeches)',
      'Geopolitics (Global Conflicts & Sanctions)',
      'Cyber / Tech News (Security, AI Impact)',
      'Global Financial News Sources & Forums',
      'Cross-Asset Data (SPX, Nasdaq, VIX, Oil, Silver, BTC)',
      'Institutional Data (COT, ETF Flows, Volume)'
    ],
    lastAction: 'All 10 streams streaming with zero dropouts over free endpoints.'
  },
  {
    id: 2,
    code: 'DATA_VALIDATION',
    title: '2. DATA PROCESSING & VALIDATION',
    subtitle: 'Quality Assurance & Outlier Filtering Gate',
    color: 'teal',
    agentName: 'Validation & Hygiene Agent',
    agentRole: 'Integrity Verification, Bad Tick Scrubbing & Deduplication',
    status: 'OPTIMAL',
    telemetry: [
      { label: 'Scrubbed Ticks', value: '100%' },
      { label: 'Bad Ticks Discarded', value: '4' },
      { label: 'Source Reliability Score', value: '99.8%' }
    ],
    items: [
      'Real-time & Scheduled Data Collection',
      'Data Cleaning & Normalization Pipeline',
      'Source Verification & Reliability Check',
      'Missing Data Handling & Error Filtering',
      'Encrypted Timescale Data Storage'
    ],
    lastAction: 'Filtered 4 anomalous spread spikes from secondary feed; baseline sanitized.'
  },
  {
    id: 3,
    code: 'REGIME_DETECTION',
    title: '3. MARKET REGIME DETECTION',
    subtitle: 'Macro Environment & Volatility Classification',
    color: 'purple',
    agentName: 'Market Regime Classifier Agent',
    agentRole: 'Dynamic Market Phase & Volatility State Recognition',
    status: 'ACTIVE',
    telemetry: [
      { label: 'Current Regime', value: 'Bullish Expansion' },
      { label: 'Volatility State', value: 'Normal (ATR 7.8)' },
      { label: 'Risk Sentiment', value: 'Risk-Off (Safe Haven Bullish)' }
    ],
    items: [
      'Trend Classification: Up / Down Momentum',
      'Range & Compression Zone Detection',
      'High vs. Low Volatility Thresholds',
      'Risk-On (Equities Leading) vs. Risk-Off (Gold Leading)',
      'Regime Confidence: 89%'
    ],
    lastAction: 'Classified market as Safe-Haven Expansion following yields pullback.'
  },
  {
    id: 4,
    code: 'MULTI_AGENT_ANALYSIS',
    title: '4. MULTI-AGENT ANALYSIS (AI POWERED)',
    subtitle: '9 Autonomous Specialist Intelligence Agents',
    color: 'blue',
    agentName: 'Multi-Agent Council Director',
    agentRole: 'Orchestrating Specialist AI Deliberation & Inter-Agent Debate',
    status: 'ACTIVE',
    telemetry: [
      { label: 'Active Council Agents', value: '9' },
      { label: 'Council Consensus', value: 'Bullish (81%)' },
      { label: 'Debate Cycles Today', value: '148' }
    ],
    items: [
      'Technical Agent (ICT, SMT, FVG, Price Action)',
      'Macro Agent (Inflation, Rates, Central Banks, Liquidity)',
      'News Agent (Breaking Wire, Sentiment Impact)',
      'Geopolitical Agent (Conflicts, Sanctions, Supply Disruptions)',
      'Sentiment Agent (Crowd Mood, Fear & Greed Index)',
      'Correlation Agent (DXY, Yields, Silver, Oil, BTC)',
      'Institutional Agent (COT Positioning, ETF Inflows)',
      'Risk Agent (Independent Safety & Sizing Guard)',
      'Vision Agent (Chart Screenshot Structure Extraction)'
    ],
    lastAction: 'Synthesized 7 Bullish, 1 Neutral, 1 Caution votes into 81% convergence.'
  },
  {
    id: 5,
    code: 'STRATEGY_ENGINE',
    title: '5. STRATEGY ENGINE',
    subtitle: 'Institutional Setup Matching & Filtering',
    color: 'gold',
    agentName: 'Strategy Selector Agent',
    agentRole: 'Matching Detected Market Regime to High-Probability Playbooks',
    status: 'ACTIVE',
    telemetry: [
      { label: 'Matched Playbook', value: 'ICT Liquidity Sweep + FVG' },
      { label: 'Timeframe Alignment', value: 'H1 Context / M15 Entry' },
      { label: 'Backtest Win-Rate', value: '64.8%' }
    ],
    items: [
      'ICT / SMT / FVG Setup Identification',
      'Liquidity Sweeps (Buy-side / Sell-side)',
      'Breakout & Retest Confirmation',
      'Trend Continuation Engine',
      'Mean Reversion in Range Regimes',
      'Session Models: London Open & NY Killzone',
      'Support & Resistance Confluence'
    ],
    lastAction: 'Validated M15 Sell-Side Liquidity Sweep into unmitigated H1 FVG zone.'
  },
  {
    id: 6,
    code: 'CONFLUENCE_SCORING',
    title: '6. CONFLUENCE & CONFIDENCE SCORING',
    subtitle: 'Transparent Multi-Factor Probability Matrix',
    color: 'teal',
    agentName: 'Confluence Matrix Engine',
    agentRole: 'Synthesizing 7 Quantitative Weight Factors into Net Confidence',
    status: 'OPTIMAL',
    telemetry: [
      { label: 'Bullish Confluence', value: '72%' },
      { label: 'Bearish Probability', value: '18%' },
      { label: 'Neutral Uncertainty', value: '10%' }
    ],
    items: [
      '✓ Technical Analysis: 84% Weight',
      '✓ Macro Factors: 76% Weight',
      '✓ News & Wire Impact: 68% Weight',
      '✓ Geopolitical Risk: 74% Weight',
      '✓ Correlation Confirmation: 81% Weight',
      '✓ Sentiment Analysis: 65% Weight',
      '✓ Institutional Flow: 79% Weight'
    ],
    lastAction: 'Final weighted probability calculated: 72% Bullish Net Bias.'
  },
  {
    id: 7,
    code: 'RISK_MANAGEMENT',
    title: '7. RISK & TRADE MANAGEMENT ENGINE',
    subtitle: 'Deterministic Capital Preservation Guardrails',
    color: 'red',
    agentName: 'Risk & Capital Protection Agent',
    agentRole: 'Position Sizing, Stop Loss Geometry & Drawdown Protection',
    status: 'ACTIVE',
    telemetry: [
      { label: 'Max Risk/Trade', value: '0.50%' },
      { label: 'Planned R:R', value: '1 : 2.85' },
      { label: 'News Lockout', value: 'Armed (T - 1h 45m)' }
    ],
    items: [
      'Entry Zone: $2,344.00 - $2,346.50',
      'Volatility-Based Stop Loss: $2,339.80',
      'Multi-Tier Take Profits: TP1 $2,354, TP2 $2,362, TP3 $2,371.50',
      'Position Sizing: 0.50 Lots ($500 risk)',
      'Spread & Slippage Safety Thresholds',
      'Max Daily Loss Boundary: -$2,000 (Protected)',
      'Invalidation: M15 Close below $2,339.80'
    ],
    lastAction: 'Locked maximum risk to 0.50% due to upcoming Core PCE release.'
  },
  {
    id: 8,
    code: 'FINAL_DECISION',
    title: '8. FINAL AI DECISION ENGINE',
    subtitle: 'Synthesized Autonomous Verdict & Reasoning',
    color: 'purple',
    agentName: 'Central Autonomous Decision Core',
    agentRole: 'Consensus Synthesis: All Agents + Strategy + Risk',
    status: 'ACTIVE',
    telemetry: [
      { label: 'Decision State', value: 'BUY SETUP' },
      { label: 'Confidence Score', value: '81%' },
      { label: 'Execution Prerequisite', value: 'HUMAN APPROVAL REQUIRED' }
    ],
    items: [
      'BUY SETUP (Active Recommendation)',
      'SELL SETUP (Inactive)',
      'WATCH (Pending Confirmation)',
      'NO TRADE (Risk Averse / Event Guarded)',
      'Full Explainable AI Reasoning Generated'
    ],
    lastAction: 'BUY SETUP signaled. Awaiting explicit operator confirmation.'
  },
  {
    id: 9,
    code: 'HUMAN_APPROVAL',
    title: '9. HUMAN APPROVAL (OPERATOR)',
    subtitle: 'Zero-Autonomous Execution Safety Bridge',
    color: 'blue',
    agentName: 'Operator Safety Interface',
    agentRole: 'Mandatory Human Gatekeeper Before Order Transmission',
    status: 'ALERT',
    telemetry: [
      { label: 'Operator Action', value: 'PENDING REVIEW' },
      { label: 'Interactive Controls', value: 'APPROVE / MODIFY / REJECT' },
      { label: 'Audit Log Status', value: 'Armed' }
    ],
    items: [
      'Review Complete AI Multi-Factor Analysis',
      'Validate Invalidation Point & Risk Budget',
      'Approve / Modify Volume & Stops / Reject',
      'No order ever executes without explicit confirmation'
    ],
    lastAction: 'Presenting setup to trader on dashboard command interface.'
  },
  {
    id: 10,
    code: 'MT5_EXECUTION',
    title: '10. TRADE EXECUTION (MT5 INTEGRATION)',
    subtitle: 'Institutional Terminal Abstraction & Broker Sync',
    color: 'green',
    agentName: 'MT5 Bridge & Order Routing Agent',
    agentRole: 'Secure Order Dispatch, Slippage Guard & Broker Handshake',
    status: 'STANDBY',
    telemetry: [
      { label: 'MT5 Terminal Status', value: 'CONNECTED (Demo/Paper)' },
      { label: 'Bridge Latency', value: '12ms' },
      { label: 'Orders Dispatched Today', value: '3' }
    ],
    items: [
      'Execute Approved Trade with Precision Timing',
      'Real-Time Bracket Order Management (SL & TP)',
      'Modify / Close / Partial Close Support',
      'Bi-directional Sync with MT5 Live Account'
    ],
    lastAction: 'Standing by for Human Operator approval signal.'
  },
  {
    id: 11,
    code: 'POSITION_MONITORING',
    title: '11. POSITION MONITORING',
    subtitle: 'Dynamic Intraday Trade Telemetry',
    color: 'amber',
    agentName: 'Active Position Guardian Agent',
    agentRole: 'Real-Time P&L Tracking, Structure Invalidation & Breakeven Trigger',
    status: 'STANDBY',
    telemetry: [
      { label: 'Open Positions', value: '0 Active (1 Pending)' },
      { label: 'Account Equity', value: '$102,450.00' },
      { label: 'Day Realized P&L', value: '+$840.00' }
    ],
    items: [
      'Continuous Live P&L Tracking (Tick-by-Tick)',
      'Automated Move to Break-Even at +1.2R',
      'Volatility Trailing Stop Management',
      'Partial Profit Taking at TP1 (+2.0R)',
      'Continuous Market Structure Invalidation Watch'
    ],
    lastAction: 'Position guardian calibrated to trigger Break-Even at $2,351.00.'
  },
  {
    id: 12,
    code: 'EXIT_MANAGEMENT',
    title: '12. EXIT MANAGEMENT',
    subtitle: 'Orderly Take Profit & Capital Preservation Exits',
    color: 'blue',
    agentName: 'Exit Strategy Execution Agent',
    agentRole: 'Deterministic Exit Logic, Structure Failures & Target Fills',
    status: 'STANDBY',
    telemetry: [
      { label: 'Planned Exit Strategy', value: 'Tiered 50% / 30% / 20%' },
      { label: 'Emergency Exit Trigger', value: 'Armed' },
      { label: 'Trailing Offset', value: '1.5 ATR' }
    ],
    items: [
      'Take Profit 1-3 Sequential Execution',
      'Hard Volatility Stop Loss Execution',
      'One-Click Manual Emergency Exit',
      'Structure Break Emergency Exit Signal',
      'Comprehensive Post-Exit Metric Capture'
    ],
    lastAction: 'Target TP1 set at $2,354.00 for initial 50% partial de-risking.'
  },
  {
    id: 13,
    code: 'LEARNING_AUDIT',
    title: '13. LEARNING & AUDIT SYSTEM',
    subtitle: 'Institutional Journal & Decision Audit Trail',
    color: 'purple',
    agentName: 'Trade Journal & Audit Intelligence Agent',
    agentRole: 'Recording Agent Opinions, Snapshots, Mistakes & Outcomes',
    status: 'OPTIMAL',
    telemetry: [
      { label: 'Journal Entries Logged', value: '142 Setups' },
      { label: 'Winning Setup Factor', value: 'DXY Divergence (78%)' },
      { label: 'Historical Database', value: 'Encrypted & Synced' }
    ],
    items: [
      'Store All Agent Analyses & Dialogue History',
      'Record Exact Market Screenshots & Ticks at Entry',
      'Track Final Trade Outcomes vs Predictions',
      'Identify Highest-Probability Winning Factors',
      'Analyze Analytical Blindspots & Outlier Losses'
    ],
    lastAction: 'Logged full 9-agent conversation state and pre-trade parameters.'
  },
  {
    id: 14,
    code: 'DASHBOARD_ALERTS',
    title: '14. DASHBOARD & ALERTS',
    subtitle: 'Multi-Channel Operator Notification Command Hub',
    color: 'teal',
    agentName: 'Alert Dispatcher Agent',
    agentRole: 'Real-Time Notification Routing (Web, Audio, Telegram, Email)',
    status: 'OPTIMAL',
    telemetry: [
      { label: 'Active Alert Channels', value: 'Web HUD + Push' },
      { label: 'Dispatch Latency', value: '45ms' },
      { label: 'Alerts Sent Today', value: '12' }
    ],
    items: [
      'Live Cinematic Market Dashboard',
      'AI Analysis & Real-Time Signal Broadcaster',
      'High-Impact News & Event Audio Alerts',
      'Live Trade Monitoring Telemetry',
      'Custom Alerts via Webhook & Telegram'
    ],
    lastAction: 'Broadcasted BUY SETUP notification across active command channels.'
  },
  {
    id: 15,
    code: 'CONTINUOUS_IMPROVEMENT',
    title: '15. CONTINUOUS IMPROVEMENT',
    subtitle: 'Autonomous Model Optimization & Feedback Loops',
    color: 'green',
    agentName: 'Model Optimization & Evolution Agent',
    agentRole: 'Strategy Performance Review, Adaptive Tuning & Knowledge Graph',
    status: 'OPTIMAL',
    telemetry: [
      { label: 'Model Version', value: 'FEF Swarm v2.6' },
      { label: 'Win Rate Optimization', value: '+3.4% this month' },
      { label: 'Human Rule Approval', value: 'Mandatory for Live Changes' }
    ],
    items: [
      'Autonomous Feedback Loop from Real Trade Results',
      'AI Agent Weight Optimization based on Accuracy',
      'Evaluation of New Free Data Connectors',
      'Strategy Performance Review Across Market Regimes',
      'Continuous Adaptation with Zero Unapproved Live Modifications'
    ],
    lastAction: 'Upgraded Correlation Agent weighting factor by +2% based on accuracy.'
  }
];
