#!/usr/bin/env node
/**
 * Окремий скрипт для обрахунку аналітики. Запускати вручну або по cron.
 * Результати пишуться в analytics_cache; додаток лише читає готові дані.
 * Приклад: node scripts/refresh-analytics.js
 *          node scripts/refresh-analytics.js 2025 2026
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { refreshAnalyticsForYear } = require('../src/analytics-refresh');

async function main() {
    const years = process.argv.slice(2).map(s => parseInt(s, 10)).filter(y => !isNaN(y));
    if (years.length === 0) {
        const current = new Date().getFullYear();
        years.push(current, current - 1);
    }
    console.log('Оновлення кешу аналітики для років:', years.join(', '));
    for (const year of years) {
        await refreshAnalyticsForYear(year);
        console.log('Готово:', year);
    }
    console.log('Готово.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
