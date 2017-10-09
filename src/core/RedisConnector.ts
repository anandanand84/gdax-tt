import redisct = require('redisct');

var config:any = require(process.cwd() + '/remote-config/config.json');

var redisPubsubHost = config.redis.pubsub.host;
var redisPubsubPort = config.redis.pubsub.port;
var redisPubsubPassword = config.redis.pubsub.password;

const redis:any = (<any>redisct)(config.redis.cache.host, config.redis.cache.port, config.redis.cache.password);

export function getClient() {
    return redis.getRedisClient(); 
}

export function getRedisct() {
    return redis; 
}

export function getEmitter() {
    var io = (<any>redisct)(redisPubsubHost, redisPubsubPort, redisPubsubPassword)
        .createNewEmitter('REDIS CONNECTOR');
    return io;
}