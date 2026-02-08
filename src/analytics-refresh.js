/**
 * Обрахунок аналітики в окремому модулі.
 * Результати пишуться в analytics_cache; API лише читає готові дані.
 */
const db = require('./db');

function getPeriodBounds(year, month) {
    const y = parseInt(year, 10);
    if (month != null && month !== '') {
        const m = parseInt(month, 10);
        const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
        const monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        return [monthStart, monthEnd];
    }
    return [`${y}-01-01`, `${y + 1}-01-01`];
}

async function upsertCache(cacheKey, data) {
    await db.query(
        `INSERT INTO analytics_cache (cache_key, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [cacheKey, JSON.stringify(data)]
    );
}

/** Розрахунок monthly: 12 місяців для року */
async function computeMonthly(year) {
    const months = [];
    for (let m = 1; m <= 12; m++) {
        const monthStart = `${year}-${String(m).padStart(2, '0')}-01`;
        const monthEnd = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, '0')}-01`;
        const incomeResult = await db.query(
            `SELECT COALESCE(SUM(total_price), 0) AS total FROM bookings
             WHERE status != 'CANCELLED' AND start_date < $2 AND end_date >= $1`,
            [monthStart, monthEnd]
        );
        const expenseResult = await db.query(
            'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= $1 AND date < $2',
            [monthStart, monthEnd]
        );
        const income = parseFloat(incomeResult.rows[0].total) || 0;
        const expenses = parseFloat(expenseResult.rows[0].total) || 0;
        months.push({ month: m, year, income, expenses, balance: income - expenses });
    }
    const totalIncome = months.reduce((s, r) => s + r.income, 0);
    const totalExpenses = months.reduce((s, r) => s + r.expenses, 0);
    return { year, months, totalIncome, totalExpenses, totalBalance: totalIncome - totalExpenses };
}

/** Розрахунок by-apartment для періоду */
async function computeByApartment(year, month) {
    const [periodStart, periodEnd] = getPeriodBounds(year, month);
    const apartments = await db.query('SELECT id, name FROM apartments WHERE deleted_at IS NULL ORDER BY name');
    const result = [];
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const apt of apartments.rows) {
        const incomeRes = await db.query(
            `SELECT COALESCE(SUM(total_price), 0) AS total FROM bookings
             WHERE apartment_id = $1 AND status != 'CANCELLED' AND start_date < $3 AND end_date >= $2`,
            [apt.id, periodStart, periodEnd]
        );
        const expRes = await db.query(
            'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE apartment_id = $1 AND date >= $2 AND date < $3',
            [apt.id, periodStart, periodEnd]
        );
        const income = parseFloat(incomeRes.rows[0].total) || 0;
        const expenses = parseFloat(expRes.rows[0].total) || 0;
        totalIncome += income;
        totalExpenses += expenses;
        result.push({ id: apt.id, name: apt.name, income, expenses, balance: income - expenses });
    }
    const noAptRes = await db.query(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE apartment_id IS NULL AND date >= $1 AND date < $2',
        [periodStart, periodEnd]
    );
    const noApartmentExpenses = parseFloat(noAptRes.rows[0].total) || 0;
    totalExpenses += noApartmentExpenses;
    return {
        apartments: result,
        noApartment: { income: 0, expenses: noApartmentExpenses, balance: -noApartmentExpenses },
        totalIncome,
        totalExpenses,
        totalBalance: totalIncome - totalExpenses
    };
}

/** Розрахунок витрат по категоріях для періоду */
async function computeExpensesByCategory(year, month) {
    const [periodStart, periodEnd] = getPeriodBounds(year, month);
    const result = await db.query(
        'SELECT category, SUM(amount)::numeric AS amount FROM expenses WHERE date >= $1 AND date < $2 GROUP BY category ORDER BY amount DESC',
        [periodStart, periodEnd]
    );
    return result.rows.map(r => ({ category: r.category, amount: parseFloat(r.amount) || 0 }));
}

/**
 * Оновлює кеш аналітики для одного року (місячний підсумок + по об'єктах і категоріях за рік і по кожному місяцю).
 */
async function refreshAnalyticsForYear(year) {
    const y = parseInt(year, 10);
    if (isNaN(y)) throw new Error('Invalid year');

    await computeMonthly(y).then(data => upsertCache(`monthly_${y}`, data));

    await computeByApartment(y).then(data => upsertCache(`by_apartment_${y}`, data));
    for (let m = 1; m <= 12; m++) {
        await computeByApartment(y, m).then(data => upsertCache(`by_apartment_${y}_${m}`, data));
    }

    await computeExpensesByCategory(y).then(data => upsertCache(`expenses_by_category_${y}`, data));
    for (let m = 1; m <= 12; m++) {
        await computeExpensesByCategory(y, m).then(data => upsertCache(`expenses_by_category_${y}_${m}`, data));
    }
}

module.exports = {
    refreshAnalyticsForYear,
    getPeriodBounds
};
