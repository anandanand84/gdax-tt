import { ProductMap } from '../../src/exchanges/ProductMap';
import { prepareProductMap } from '../../test/helper';

const assert = require('assert');

describe('ccxt product map', function () {
    before(async () => {
        return prepareProductMap();
    })

    it('should find generic product based on exchange product', function () {
        console.log('starting');
        let genericUSDETH = ProductMap.ExchangeMap.get('GDAX').getGenericProduct('BTC-USD');
        assert.deepEqual('BTC/USD', genericUSDETH);
    })

    it('should find exchange product based on generic product', function () {
        let exchangeUSDETH = ProductMap.ExchangeMap.get('GDAX').getExchangeProduct('BTC/USD');
        assert.deepEqual('BTC-USD', exchangeUSDETH);
    })
})
