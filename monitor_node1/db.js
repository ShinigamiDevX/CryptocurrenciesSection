const mysql = require('mysql2/promise');

async function connectDb() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'indirizzi'
    });
    return connection;
}

module.exports = { connectDb };
