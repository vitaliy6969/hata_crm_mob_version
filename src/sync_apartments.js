const db = require('./db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const apartments = [
    { name: "ЖК Олімпійський, кв 46", base_price: 1000 },
    { name: "Львівська, 6", base_price: 1000 },
    { name: "Провулок вокзальний 12", base_price: 1000 },
    { name: "Огієнка 1", base_price: 1000 },
    { name: "Покровська, 5/1 кв 12", base_price: 1000 },
    { name: "Кібальчича, 13, кв 75", base_price: 1000 },
    { name: "бориса тена 1", base_price: 1000 },
    { name: "бориса тена 2", base_price: 1000 },
    { name: "ЖК Мрія, кв 34", base_price: 1000 },
    { name: "Селецька 21", base_price: 1000 },
    { name: "Івана мазепи 13/8", base_price: 1000 },
    { name: "2 провулок київський 6", base_price: 1000 },
    { name: "шляхетний 16", base_price: 1000 },
    { name: "Івана мазепи 13/13", base_price: 1000 },
    { name: "Князів Острозьких", base_price: 1000 },
    { name: "Вацківський 5", base_price: 1000 }
];

async function sync() {
    console.log('Cleaning up old apartment data...');
    try {
        await db.query('DELETE FROM apartments');
        console.log('Inserting authoritative apartments...');

        for (const apt of apartments) {
            await db.query(
                'INSERT INTO apartments (name, base_price) VALUES ($1, $2)',
                [apt.name, apt.base_price]
            );
            console.log(`  Added: ${apt.name}`);
        }
        console.log('Sync complete.');
    } catch (err) {
        console.error('Error during sync:', err.message);
    }
    process.exit();
}

sync();
