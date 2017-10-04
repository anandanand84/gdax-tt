import redisct = require('redisct');

const redis = redisct();

export function getClient() {
    return redis.getRedisClient(); 
}

export function getRedisct() {
    return redis; 
}

export function getEmitter() {
    return redis.createNewEmitter('REDIS CONNECTOR'); 
}