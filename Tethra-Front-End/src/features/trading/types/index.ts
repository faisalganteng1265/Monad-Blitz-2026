export interface Market {
  symbol: string;
  tradingViewSymbol: string;
  logoUrl?: string;
  binanceSymbol?: string;
  category: 'crypto' | 'forex' | 'indices' | 'commodities' | 'stocks';
  maxLeverage?: number;
}

export interface MarketData {
  price?: string;
  priceChange?: string;
  priceChangePercent?: string;
  high24h?: string;
  low24h?: string;
  volume24h?: string;
}

export interface FuturesData {
  fundingRate: string;
  nextFundingTime: number;
  openInterest?: string;
  openInterestValue: string;
}

export interface OraclePrice {
  price: number;
}
