/**
 * Format utilities for order panel components
 */

export const formatPrice = (price: number): string => {
  if (isNaN(price) || price === 0) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

export const formatPriceWithDecimals = (price: number, decimals: number): string => {
  if (isNaN(price)) return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(price);
};

export const formatTokenAmount = (amount: number): string => {
  if (isNaN(amount) || amount === 0) return '0.0';
  return amount.toFixed(6);
};

export const formatLeverage = (lev: number): string => {
  return lev.toFixed(1);
};
