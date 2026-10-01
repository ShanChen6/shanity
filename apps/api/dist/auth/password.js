import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value) => createHash('sha256').update(value).digest('hex');
function derive(password, salt) {
    return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key))));
}
export async function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
    const parts = stored?.split('$');
    const valid = parts?.length === 3 &&
        parts[0] === 'scrypt' &&
        /^[a-f0-9]{32}$/.test(parts[1]) &&
        /^[a-f0-9]{128}$/.test(parts[2]);
    const key = await derive(password, valid ? parts[1] : '00000000000000000000000000000000');
    return Boolean(valid && timingSafeEqual(key, Buffer.from(parts[2], 'hex')));
}
//# sourceMappingURL=password.js.map