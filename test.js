require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { fetchDeals } = require('./src/fetcher');

async function runTests() {
    console.log('🧪 Starting Offline/Live Validation Tests...\n');
    let passed = true;

    // 1. Verify database.json loading
    try {
        const dbPath = path.join(__dirname, 'database.json');
        if (!fs.existsSync(dbPath)) throw new Error('database.json does not exist');
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        console.log('✅ PASS: database.json exists and contains valid JSON.');
        if (db.guilds.default.channels.shopee === '1528544690515742720') {
            console.log('✅ PASS: Mapped Shopee default channel ID correct.');
        } else {
            console.warn('⚠️ WARNING: Mapped Shopee default channel ID mismatch.');
        }
    } catch (err) {
        console.error('❌ FAIL: database.json validation error:', err.message);
        passed = false;
    }

    // 2. Verify deal pools existence & sizes
    const platforms = ['shopee', 'lazada', 'shein'];
    for (const p of platforms) {
        try {
            const filePath = path.join(__dirname, 'deals', `${p}.json`);
            if (!fs.existsSync(filePath)) throw new Error(`${p}.json deal file missing`);
            const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!Array.isArray(items)) throw new Error(`${p}.json is not a JSON array`);
            if (items.length !== 50) throw new Error(`${p}.json does not contain exactly 50 items (found ${items.length})`);
            console.log(`✅ PASS: ${p}.json deal pool exists and contains exactly 50 items.`);
        } catch (err) {
            console.error(`❌ FAIL: Deal pool ${p} validation error:`, err.message);
            passed = false;
        }
    }

    // 3. Verify fetchDeals pagination & affiliate formatting for local deals
    try {
        console.log('\nTesting local deal fetching with pagination and affiliate params...');
        const page = 3;
        const affiliateParams = '?ref=test_affiliate';
        const deals = await fetchDeals('lazada', page, affiliateParams);
        
        if (deals.length !== 10) throw new Error(`Expected 10 items on page ${page}, got ${deals.length}`);
        
        // Check if items correspond to page 3 (indices 20 to 29)
        const firstItem = deals[0];
        if (!firstItem.id.startsWith('lazada_21')) { // 1-indexed count: page 3 starts with item 21
            throw new Error(`Expected first item ID on page 3 to start with lazada_21, got ${firstItem.id}`);
        }
        
        // Check if affiliate params are correctly appended
        if (!firstItem.url.endsWith(affiliateParams)) {
            throw new Error(`Affiliate params not appended to URL. Expected ending: ${affiliateParams}, got: ${firstItem.url}`);
        }

        console.log(`✅ PASS: Local deal pagination and affiliate link injection successful (fetched page ${page}, first ID: ${firstItem.id}, url: ${firstItem.url})`);
    } catch (err) {
        console.error('❌ FAIL: Local deals fetcher test failed:', err.message);
        passed = false;
    }

    // 4. Verify Live Shopilya (R18) fetch
    try {
        console.log('\nTesting live Shopilya (R18) fetch (Page 1)...');
        const affiliateParams = '?src=ppc&c=19794429308';
        const deals = await fetchDeals('r18', 1, affiliateParams);
        
        if (deals.length === 0) {
            throw new Error('No products returned from Shopilya. API might be down or blocked.');
        }
        
        console.log(`✅ PASS: Live Shopilya fetch succeeded. Retrieved ${deals.length} products.`);
        console.log(`- Sample Product: "${deals[0].title}"`);
        console.log(`- Price: ${deals[0].price}`);
        console.log(`- URL: ${deals[0].url}`);
        console.log(`- Image: ${deals[0].imageUrl ? 'Present (OK)' : 'None (Warning)'}`);
        
        if (!deals[0].url.includes(affiliateParams)) {
            throw new Error(`Shopilya URL missing affiliate params: ${deals[0].url}`);
        }
        console.log('✅ PASS: Shopilya affiliate link injection successful.');

    } catch (err) {
        console.error('❌ FAIL: Shopilya live fetch test failed:', err.message);
        passed = false;
    }

    console.log('\n----------------------------------------');
    if (passed) {
        console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! Codebase is ready.');
    } else {
        console.error('❌ SOME TESTS FAILED. Please review the errors.');
        process.exit(1);
    }
}

runTests();
