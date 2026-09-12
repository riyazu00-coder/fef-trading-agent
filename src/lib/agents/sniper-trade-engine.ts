export interface SniperOrderTicket {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  orderType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_MARKET' | 'SELL_MARKET';
  entryPrice: number;
  stopLossPrice: number;
  stopLossPips: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  accountBalance: number;
  riskPercent: number;
  riskDollars: number;
  recommendedLots: number;
  estimatedRewardDollars: number;
  riskRewardRatio: string;
  status: 'PENDING_APPROVAL' | 'DEPLOYED_TO_MT5' | 'CANCELLED';
  invalidationReason: string;
}

export function calculateSniperOrderTicket(
  symbol: string,
  direction: 'BUY' | 'SELL',
  currentPrice: number,
  accountBalance: number = 102450.00,
  riskPercent: number = 0.50
): SniperOrderTicket {
  const riskDollars = Number(((accountBalance * riskPercent) / 100).toFixed(2));
  const isBuy = direction === 'BUY';
  const isForex = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'].includes(symbol);
  const decimals = isForex ? 4 : symbol === 'USDJPY' ? 2 : currentPrice > 100 ? 2 : 2;

  // Dynamic Stop Loss based on ATR / structural swing
  let slDistance = 6.0; // default for Gold $6.00
  let tickValuePerLot = 100; // Gold: $100 per $1 move for 1.00 lot

  if (isForex) {
    slDistance = 0.0025; // 25 pips
    tickValuePerLot = 100000;
  } else if (symbol === 'USDJPY') {
    slDistance = 0.35; // 35 pips
    tickValuePerLot = 1000;
  } else if (symbol === 'USOIL') {
    slDistance = 1.10; // $1.10 per barrel
    tickValuePerLot = 1000;
  } else if (symbol === 'BTCUSD') {
    slDistance = 650.0;
    tickValuePerLot = 1;
  } else if (symbol === 'ETHUSD') {
    slDistance = 45.0;
    tickValuePerLot = 10;
  } else if (symbol === 'XAGUSD') {
    slDistance = 0.35;
    tickValuePerLot = 5000;
  }

  const entryPrice = currentPrice;
  const stopLossPrice = isBuy
    ? Number((entryPrice - slDistance).toFixed(decimals))
    : Number((entryPrice + slDistance).toFixed(decimals));

  const lossPerLot = slDistance * (symbol === 'XAUUSD' ? 100 : symbol === 'BTCUSD' ? 1 : symbol === 'USOIL' ? 1000 : 1000);
  const calculatedLots = Math.max(0.1, Number((riskDollars / (lossPerLot || 1)).toFixed(2)));

  const tp1Distance = slDistance * 1.5;
  const tp2Distance = slDistance * 2.85;
  const tp3Distance = slDistance * 4.5;

  const tp1Price = isBuy ? Number((entryPrice + tp1Distance).toFixed(decimals)) : Number((entryPrice - tp1Distance).toFixed(decimals));
  const tp2Price = isBuy ? Number((entryPrice + tp2Distance).toFixed(decimals)) : Number((entryPrice - tp2Distance).toFixed(decimals));
  const tp3Price = isBuy ? Number((entryPrice + tp3Distance).toFixed(decimals)) : Number((entryPrice - tp3Distance).toFixed(decimals));

  const estimatedRewardDollars = Number((riskDollars * 2.85).toFixed(2));

  return {
    id: `SNIPER-${symbol}-${Date.now().toString().slice(-5)}`,
    symbol,
    direction,
    orderType: isBuy ? 'BUY_LIMIT' : 'SELL_LIMIT',
    entryPrice,
    stopLossPrice,
    stopLossPips: Number(slDistance.toFixed(decimals)),
    tp1Price,
    tp2Price,
    tp3Price,
    accountBalance,
    riskPercent,
    riskDollars,
    recommendedLots: calculatedLots,
    estimatedRewardDollars,
    riskRewardRatio: '1 : 2.85',
    status: 'PENDING_APPROVAL',
    invalidationReason: `M15 structural close beyond $${stopLossPrice}`
  };
}
