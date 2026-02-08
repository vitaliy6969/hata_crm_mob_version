const db = require('./db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SITE_ID = '4cabe07c-ca37-4566-b47a-8699051d685b';

async function migrate() {
    console.log('Fetching products from Wix...');
    const WIX_TOKEN = process.env.WIX_TOKEN;

    const response = await fetch('https://www.wixapis.com/stores/v1/products/query', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WIX_TOKEN}`,
            'Content-Type': 'application/json',
            'wix-site-id': SITE_ID
        },
        body: JSON.stringify({ query: { paging: { limit: 100 } } })
    });

    const data = await response.json();
    const products = data.products || [];

    console.log(`Found ${products.length} products. Inserting into CRM...`);

    for (const p of products) {
        const name = p.name.trim();
        const basePrice = parseFloat(p.costData?.price || 0);
        const wixId = p.id;

        try {
            await db.query(
                `INSERT INTO apartments (name, wix_id, base_price) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (name) DO UPDATE SET wix_id = $2, base_price = $3`,
                [name, wixId, basePrice]
            );
            console.log(`  Synced: ${name}`);
        } catch (err) {
            console.error(`  Error syncing ${name}:`, err.message);
        }
    }
    console.log('Migration complete.');
    process.exit();
}

migrate();
