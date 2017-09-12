import { ProductMap } from '../src/exchanges/ProductMap';

let fetchingInprogress = false;
let fetchingPromise:Promise<true>;

export async function prepareProductMap() {
    if(ProductMap.ExchangeMap.size < 4 && (!fetchingInprogress)) {
        fetchingInprogress = true;
        let gdaxPromise = ProductMap.configureExchange('GDAX');
        let bitfinexPromise = ProductMap.configureExchange('Bitfinex');
        let bittrexPromise = ProductMap.configureExchange('Bittrex');
        let poloniexPromise = ProductMap.configureExchange('Poloniex');
        fetchingPromise = <any>Promise.all([gdaxPromise, bitfinexPromise, bittrexPromise, poloniexPromise]);
        return fetchingPromise;
    } else if(fetchingInprogress) {
        return fetchingPromise;
    }
    else {
        return Promise.resolve(true);
    }
}
prepareProductMap();