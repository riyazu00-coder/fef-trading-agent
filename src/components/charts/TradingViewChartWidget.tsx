'use client';

import React, { useEffect, useRef, memo } from 'react';

interface TradingViewChartWidgetProps {
  symbol: string;
  timeframe?: string;
  theme?: 'dark' | 'light';
  autosize?: boolean;
  height?: number | string;
}

/**
 * Maps FEF canonical symbols to accurate TradingView symbols
 */
function mapToTradingViewSymbol(symbol: string): string {
  const s = symbol.toUpperCase();
  switch (s) {
    // Metals
    case 'XAUUSD':
      return 'OANDA:XAUUSD';
    case 'XAGUSD':
      return 'OANDA:XAGUSD';

    // Major Forex
    case 'EURUSD':
      return 'FX:EURUSD';
    case 'GBPUSD':
      return 'FX:GBPUSD';
    case 'USDJPY':
      return 'FX:USDJPY';
    case 'AUDUSD':
      return 'FX:AUDUSD';
    case 'USDCAD':
      return 'FX:USDCAD';
    case 'USDCHF':
      return 'FX:USDCHF';
    case 'NZDUSD':
      return 'FX:NZDUSD';
    case 'GBPJPY':
      return 'FX:GBPJPY';
    case 'EURJPY':
      return 'FX:EURJPY';
    case 'EURGBP':
      return 'FX:EURGBP';
    case 'AUDJPY':
      return 'FX:AUDJPY';
    case 'CADJPY':
      return 'FX:CADJPY';
    case 'CHFJPY':
      return 'FX:CHFJPY';

    // Crypto
    case 'BTCUSD':
      return 'BINANCE:BTCUSDT';
    case 'ETHUSD':
      return 'BINANCE:ETHUSDT';
    case 'SOLUSD':
      return 'BINANCE:SOLUSDT';
    case 'XRPUSD':
      return 'BINANCE:XRPUSDT';
    case 'BNBUSD':
      return 'BINANCE:BNBUSDT';
    case 'ADAUSD':
      return 'BINANCE:ADAUSDT';
    case 'DOGEUSD':
      return 'BINANCE:DOGEUSDT';
    case 'LTCUSD':
      return 'BINANCE:LTCUSDT';
    case 'AVAXUSD':
      return 'BINANCE:AVAXUSDT';
    case 'LINKUSD':
      return 'BINANCE:LINKUSDT';

    // Indices
    case 'US100':
      return 'NASDAQ:NDX';
    case 'US500':
      return 'SP:SPX';
    case 'US30':
      return 'DJ:DJI';
    case 'GER40':
      return 'XETR:DAX';
    case 'UK100':
      return 'INDEX:FTSE';
    case 'JP225':
      return 'INDEX:NKY';

    // Commodities
    case 'USOIL':
      return 'TVC:USOIL';
    case 'UKOIL':
      return 'TVC:UKOIL';
    case 'NATGAS':
      return 'NYMEX:NG1!';

    default:
      return `FX:${s}`;
  }
}

/**
 * Maps FEF timeframe strings to TradingView intervals
 */
function mapToTradingViewInterval(tf?: string): string {
  const t = (tf || 'M30').toUpperCase();
  switch (t) {
    case 'M1':
      return '1';
    case 'M5':
      return '5';
    case 'M15':
      return '15';
    case 'M30':
      return '30';
    case 'H1':
      return '60';
    case 'H4':
      return '240';
    case 'D1':
      return 'D';
    case 'W1':
      return 'W';
    default:
      return '30';
  }
}

export const TradingViewChartWidgetComponent: React.FC<TradingViewChartWidgetProps> = ({
  symbol,
  timeframe = 'M30',
  theme = 'dark',
  autosize = true,
  height = 360,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tvSymbol = mapToTradingViewSymbol(symbol);
  const tvInterval = mapToTradingViewInterval(timeframe);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any previous widget DOM
    container.innerHTML = '';

    // Create wrapper div required by TradingView widget script
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';
    container.appendChild(widgetDiv);

    // Create TradingView embed script
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;

    const config = {
      autosize: autosize,
      symbol: tvSymbol,
      interval: tvInterval,
      timezone: 'Etc/UTC',
      theme: theme,
      style: '1', // Candlesticks
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: false,
      calendar: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      save_image: false,
      support_host: 'https://www.tradingview.com',
      backgroundColor: 'rgba(3, 7, 17, 0.95)',
      gridColor: 'rgba(255, 255, 255, 0.05)',
      toolbar_bg: '#030711',
    };

    script.innerHTML = JSON.stringify(config);
    container.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [tvSymbol, tvInterval, theme, autosize]);

  return (
    <div
      className="tradingview-widget-container rounded-xl overflow-hidden border border-white/10 shadow-2xl relative bg-[#030711]/90"
      style={{ height, width: '100%' }}
      ref={containerRef}
    />
  );
};

export const TradingViewChartWidget = memo(TradingViewChartWidgetComponent);
