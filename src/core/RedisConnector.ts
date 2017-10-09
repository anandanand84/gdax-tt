import redisct = require('redisct');

var config:any = require(process.cwd() + '/remote-config/config.json');

const redis:any = (<any>redisct)(config.redis.cache.host, config.redis.cache.port, config.redis.cache.password);

export function getClient() {
    return redis.getRedisClient(); 
}

export function getRedisct() {
    return redis; 
}

export function getEmitter() {
    return redis.createNewEmitter('REDIS CONNECTOR'); 
}