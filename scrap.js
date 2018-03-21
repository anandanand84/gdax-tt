var WebSocket = require('ws');;
var socket = new WebSocket('wss://stream.binance.com:9443/ws/nanobtc@depth'); 
socket.on('error', ()=> { 
    console.log('errored')
});
socket.on('close', ()=> { 
    console.log('closed')
});
socket.on('open', ()=> { 
    console.log('opened')
});
socket.on('pong', (data)=> { 
    console.log('ponged', data.toString());
});

