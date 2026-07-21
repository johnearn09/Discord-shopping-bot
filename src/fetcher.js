const fs = require('fs');
const path = require('path');

/**
 * Fetches 10 items from a given category and page (1-5), and appends affiliate tracking params.
 * @param {string} category - 'shopee', 'lazada', 'shein', or 'r18'
 * @param {number} page - page number (1-5)
 * @param {string} affiliateParams - tracking query string (e.g. '?exlaz=...')
 * @returns {Promise<Array>} List of formatted products
 */
async function fetchDeals(category, page = 1, affiliateParams = '') {
    const pageNum = Math.min(Math.max(parseInt(page) || 1, 1), 5);
    const limit = 10;

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
                
                // If on sale, calculate discount percent
                if (compareAtVal > priceVal) {
                    promoType = 'flash_sale';
                    const discountPercent = Math.round(((compareAtVal - priceVal) / compareAtVal) * 100);
                    if (discountPercent > 0) {
                        discountText = `${discountPercent}% OFF`;
                        originalPrice = `₱${compareAtVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }
                }

                const baseUrl = `https://shopilya.com/products/${p.handle}`;
                const imageUrl = p.images && p.images[0] ? p.images[0].src : '';
                
                // Construct clean affiliate link
                const cleanAffiliateParams = affiliateParams ? (affiliateParams.startsWith('?') ? affiliateParams : '?' + affiliateParams) : '';
                const finalUrl = baseUrl + cleanAffiliateParams;

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
            // Read from local JSON deal pool
            const filePath = path.join(__dirname, '..', 'deals', `${category}.json`);
            if (!fs.existsSync(filePath)) {
                console.error(`Local deal pool file not found: ${filePath}`);
                return [];
            }
            
            const rawData = fs.readFileSync(filePath, 'utf8');
            const allItems = JSON.parse(rawData);

            // Paginate (slice 10 items)
            const startIndex = (pageNum - 1) * limit;
            const pageItems = allItems.slice(startIndex, startIndex + limit);

            return pageItems.map(item => {
                const baseUrl = item.url;
                const cleanAffiliateParams = affiliateParams ? (affiliateParams.startsWith('?') ? affiliateParams : '?' + affiliateParams) : '';
                const finalUrl = baseUrl + cleanAffiliateParams;

                return {
                    id: item.id,
                    title: item.title,
                    price: item.price,
                    promoType: item.promoType || null,
                    url: finalUrl,
                    imageUrl: item.imageUrl
                };
            });
        } catch (err) {
            console.error(`Error reading local deals for ${category} page ${pageNum}:`, err.message);
            return [];
        }
    }
}

module.exports = { fetchDeals };
