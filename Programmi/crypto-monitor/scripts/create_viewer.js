import db from './db.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;
const hashPassword = (pwd) => bcrypt.hashSync(pwd, BCRYPT_ROUNDS);

const email = 'viewer@test.com';
const password = 'password123';
const id = crypto.randomUUID();

try {
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
        db.prepare('UPDATE users SET passwordHash = ?, role = ? WHERE email = ?')
            .run(hashPassword(password), 'user', email);
        console.log('User viewer@test.com updated with role "user" and password "password123"');
    } else {
        db.prepare(`
            INSERT INTO users (id, email, passwordHash, role, status, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, email, hashPassword(password), 'user', 'active', new Date().toISOString());
        console.log('User viewer@test.com created with role "user" and password "password123"');
    }
} catch (e) {
    console.error('Error:', e);
}
