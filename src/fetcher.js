const fs = require('fs');
const path = require('path');

/**
 * Fetches 5 items from a given category and page (1-10), and appends affiliate tracking params.
 * @param {string} category - 'shopee', 'lazada', 'shein', or 'r18'
 * @param {number} page - page number (1-10)
 * @param {string} affiliateParams - tracking query string (e.g. '?exlaz=...')
 * @returns {Promise<Array>} List of formatted products
 */
async function fetchDeals(category, page = 1, affiliateParams = '') {
    const pageNum = Math.min(Math.max(parseInt(page) || 1, 1), 10);
    const limit = 5;

    // Clean affiliate parameters (strip quotes, trim spaces)
    let cleanParams = (affiliateParams || '').replace(/^['"]|['"]$/g, '').trim();
    
    // Robust check: If user accidentally pasted a full URL as the affiliate parameters, extract only the query part
    if (cleanParams.startsWith('http://') || cleanParams.startsWith('https://')) {
        try {
            const parsedUrl = new URL(cleanParams);
            cleanParams = parsedUrl.search || ''; // Extract only the query (e.g., ?smtt=0.1)
        } catch (e) {
            cleanParams = '';
        }
    }

    const cleanAffiliateParams = cleanParams ? (cleanParams.startsWith('?') ? cleanParams : '?' + cleanParams) : '';

    if (category === 'r18') {
        try {
            const response = await fetch(`https://shopilya.com/products.json?limit=${limit}&page=${pageNum}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (!data.products) return [];

            return data.products.map(p => {
                const priceVal = p.variants && p.variants[0] ? parseFloat(p.variants[0].price) || 0 : 0;
                const priceStr = `₱${priceVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                
                let promoType = null;
                let discountText = null;
                let originalPrice = null;

                const compareAtVal = p.variants && p.variants[0] && p.variants[0].compare_at_price ? parseFloat(p.variants[0].compare_at_price) || 0 : 0;
                
                if (compareAtVal > priceVal) {
                    promoType = 'flash_sale';
                    const discountPercent = Math.round(((compareAtVal - priceVal) / compareAtVal) * 100);
                    if (discountPercent > 0) {
                        discountText = `${discountPercent}% OFF`;
                        originalPrice = `₱${compareAtVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }
                }

                const baseUrl = `https://shopilya.com/products/${p.handle}`.trim();
                const finalUrl = (baseUrl + cleanAffiliateParams).trim();
                const imageUrl = p.images && p.images[0] ? p.images[0].src.trim() : '';

                return {
                    id: `r18_${p.id}`,
                    title: p.title,
                    price: priceStr,
                    originalPrice: originalPrice,
                    discountText: discountText,
                    promoType: promoType,
                    url: finalUrl,
                    imageUrl: imageUrl
                };
            });
        } catch (err) {
            console.error(`Error fetching Shopilya (r18) products page ${pageNum}:`, err.message);
            return [];
        }
    } else {
        try {
            const filePath = path.join(__dirname, '..', 'deals', `${category}.json`);
            if (!fs.existsSync(filePath)) {
                console.error(`Local deal pool file not found: ${filePath}`);
                return [];
            }
            
            const rawData = fs.readFileSync(filePath, 'utf8');
            const allItems = JSON.parse(rawData);

            const startIndex = (pageNum - 1) * limit;
            const pageItems = allItems.slice(startIndex, startIndex + limit);

            return pageItems.map(item => {
                const baseUrl = item.url.trim();
                const finalUrl = (baseUrl + cleanAffiliateParams).trim();
                const imageUrl = item.imageUrl ? item.imageUrl.trim() : '';

                return {
                    id: item.id,
                    title: item.title,
                    price: item.price,
                    promoType: item.promoType || null,
                    url: finalUrl,
                    imageUrl: imageUrl
                };
            });
        } catch (err) {
            console.error(`Error reading local deals for ${category} page ${pageNum}:`, err.message);
            return [];
        }
    }
}

module.exports = { fetchDeals };
