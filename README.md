# FEF TRADING AGENT — Forex & Commodities Multi-Agent Trading System

An institutional-grade, multi-agent AI trading framework tailored specifically for **XAU/USD (Gold)**, **US Oil (WTI)**, **EUR/USD**, **GBP/USD**, and **USD/JPY**. Built with **MetaTrader 5 (MT5)** execution, macroeconomic & geopolitical intelligence, session-aware risk guardrails, and a **Cinematic 3D WebGL Command Center**.

---

## 🚀 Quick Start

### 1. Run the Multi-Agent Engine & 3D Command Center
Start the server directly with Python 3:

```bash
python3 -m backend.server 8000
```

Open your browser to:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## ⚡ MetaTrader 5 (MT5) Integration (macOS & Windows)

The system includes a zero-dependency local TCP socket bridge designed to work seamlessly on macOS (via native/Wine) as well as Windows:

1. Open **MetaTrader 5**.
2. Go to **File $\rightarrow$ Open Data Folder $\rightarrow$ MQL5 $\rightarrow$ Experts**.
3. Copy [`mql5/FEF TRADING AGENTBridge.mq5`](mql5/FEF TRADING AGENTBridge.mq5) into that folder.
4. In MT5, refresh the **Navigator** pane, drag `FEF TRADING AGENTBridge` onto any chart (e.g., `XAUUSD` M15).
5. Ensure **"Allow Algo Trading"** is enabled in the top MT5 toolbar.
6. The EA will start listening on `127.0.0.1:5555`. The Python engine auto-detects the bridge and routes live orders directly to your MT5 account.
7. *Note:* If MT5 is closed, the system automatically runs the high-fidelity **Paper Trading Simulator** so you can test strategies without risk.

---

## 🧠 Multi-Agent Architecture

```
                                  [ Live Ticks / Market Data ]
                                               │
               ┌───────────────────────────────┼───────────────────────────────┐
               ▼                               ▼                               ▼
    [ Macro & Central Bank ]        [ Geopolitics & Energy ]        [ SMC Technical Analyst ]
    - DXY Dollar Index              - OPEC+ Production Quotas       - Asian Liquidity Sweeps
    - 10Y US Treasury Yields        - EIA Crude Inventory Draws     - Order Blocks & FVGs
    - Fed, ECB, BOE, BOJ Rates      - Safe-Haven Gold Flows         - Multi-Timeframe ATR
               │                               │                               │
               └───────────────────────┬───────┴───────────────────────────────┘
                                       ▼
                       [ Bull vs. Bear Debate Arena ]
                       - Bullish upside catalyst thesis
                       - Bearish risk & liquidation counter-attack
                       - Debate Judge consensus scoring (-1.0 to +1.0)
                                       │
                                       ▼
                       [ Session & News Risk Guardian ]
                       - Economic news blackout (NFP, CPI, FOMC)
                       - Spread threshold verification
                       - Capital exposure & 1-day 99% VaR filter
                                       │
                                       ▼
                          [ Lot-Sizing Trader Agent ]
                       - Mathematical Lot sizing (Standard/Mini/Micro)
                       - Risk strictly capped at 1.0% of balance
                       - Attached Stop Loss & Take Profit bracket
                                       │
                                       ▼
                         [ MetaTrader 5 Socket Bridge ]
                         (or Built-In Paper Simulator)
```

---

## 🧪 Running Automated Tests

Run the complete test suite:

```bash
python3 -m unittest discover -s tests -p "test_*.py"
```

Verified test coverage:
* `test_pip_calculations.py`: Validates pip sizing, tick values, and mathematical lot sizing for Gold, Oil, EUR/USD, GBP/USD, USD/JPY.
* `test_risk_guardian.py`: Tests economic calendar high-impact news blackout rejection and minimum 1:2 R:R filter.
* `test_debate_graph.py`: Validates end-to-end multi-agent pipeline execution.

---

## ⚙️ Configuration

Custom parameters can be tuned in `backend/config.py` or `.env`:
* `max_account_risk_pct`: Maximum risk percentage per trade (default `1.0%`).
* `news_blackout_minutes`: Blackout window before & after high-impact events (default `15` mins).
* `min_risk_reward_ratio`: Enforces minimum reward to risk (default `2.0:1`).
