const axios = require('axios');

/**
 * Fetch crypto prices from Binance API
 */
async function fetchCryptoPricesFromBinance() {
  try {
    console.log('[BINANCE_API] Fetching crypto prices from Binance...');
    
    // Fetch multiple crypto pairs at once
    const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
      timeout: 10000
    });
    
    const prices = response.data;
    
    // Extract EUR prices for our cryptos
    const btcEur = prices.find(p => p.symbol === 'BTCEUR')?.price;
    const ltcEur = prices.find(p => p.symbol === 'LTCEUR')?.price;
    const solEur = prices.find(p => p.symbol === 'SOLEUR')?.price;
    
    if (!btcEur || !ltcEur || !solEur) {
      throw new Error('Missing EUR prices from Binance');
    }
    
    const result = {
      BTC: parseFloat(btcEur),
      LTC: parseFloat(ltcEur), 
      SOL: parseFloat(solEur),
      timestamp: Date.now()
    };
    
    console.log('[BINANCE_API] Successfully fetched prices:', result);
    return result;
    
  } catch (error) {
    console.error('[BINANCE_API] Error fetching prices from Binance:', error);
    
    // Fallback to CoinGecko if Binance fails
    console.log('[BINANCE_API] Falling back to CoinGecko...');
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,litecoin,solana&vs_currencies=eur');
      return {
        BTC: response.data.bitcoin.eur,
        LTC: response.data.litecoin.eur,
        SOL: response.data.solana.eur,
        timestamp: Date.now()
      };
    } catch (fallbackError) {
      console.error('[BINANCE_API] Fallback also failed:', fallbackError);
      // Return hardcoded fallback prices
      return {
        BTC: 60000,
        LTC: 70,
        SOL: 150,
        timestamp: Date.now()
      };
    }
  }
}

/**
 * Convert EUR amount to crypto amount
 */
function convertEurToCrypto(eurAmount, cryptoSymbol, prices) {
  const price = prices[cryptoSymbol.toUpperCase()];
  if (!price) {
    throw new Error(`Price not found for ${cryptoSymbol}`);
  }
  
  const cryptoAmount = eurAmount / price;
  console.log(`[CRYPTO_CONVERT] €${eurAmount} = ${cryptoAmount} ${cryptoSymbol} (Rate: 1 ${cryptoSymbol} = €${price})`);
  
  return cryptoAmount;
}

/**
 * Format crypto amount with appropriate decimal places
 */
function formatCryptoAmount(amount, cryptoSymbol) {
  switch (cryptoSymbol.toUpperCase()) {
    case 'BTC':
      return amount.toFixed(8); // Bitcoin uses 8 decimal places
    case 'LTC':
      return amount.toFixed(8); // Litecoin uses 8 decimal places
    case 'SOL':
      return amount.toFixed(6); // Solana uses 6 decimal places typically
    default:
      return amount.toFixed(6);
  }
}

module.exports = {
  fetchCryptoPricesFromBinance,
  convertEurToCrypto,
  formatCryptoAmount
}; 