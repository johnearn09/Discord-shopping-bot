const fs = require('fs');
const path = require('path');

/**
 * Fetches 5 items from a given category and page (1-10), and appends affiliate tracking params.
 * Uses a live Reddit RSS aggregator for Shopee and Lazada, and falls back to local database files.
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
            cleanParams = parsedUrl.search || '';
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
    } else if (category === 'shopee' || category === 'lazada') {
        const liveDeals = [];
        
        try {
            // Attempt to fetch from r/ShopeePH RSS feed via rss2json converter (bypasses bot blocks)
            const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://www.reddit.com/r/ShopeePH/new.rss', {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'ok' && data.items) {
                    for (const item of data.items) {
                        const content = item.content || '';
                        
                        // Parse target link based on category
                        let linkMatch = null;
                        if (category === 'shopee') {
                            // Match shope.ee or shopee.ph links
                            linkMatch = content.match(/href="(https:\/\/shope\.ee\/[a-zA-Z0-9]+|https:\/\/shopee\.ph\/[a-zA-Z0-9\-_.?=%&]+)"/i);
                        } else if (category === 'lazada') {
                            // Match s.lazada.com.ph or lazada.com.ph links
                            linkMatch = content.match(/href="(https:\/\/s\.lazada\.com\.ph\/[a-zA-Z0-9\-_.?=%&]+|https:\/\/www\.lazada\.com\.ph\/products\/[a-zA-Z0-9\-_.?=%&]+)"/i);
                        }
                        
                        if (linkMatch) {
                            const rawUrl = linkMatch[1];
                            // Clean up url query parts before appending user affiliate params
                            const cleanUrl = rawUrl.split('?')[0]; 
                            const finalUrl = (cleanUrl + cleanAffiliateParams).trim();
                            
                            // Clean title (remove reddit tags)
                            let cleanTitle = item.title.replace(/\[.*?\]/g, '').trim();
                            if (cleanTitle.length > 80) cleanTitle = cleanTitle.substring(0, 77) + '...';

                            liveDeals.push({
                                id: `${category}_live_${item.guid.split('/').pop()}`,
                                title: cleanTitle,
                                price: '₱ (See site for price)',
                                promoType: 'day_sale',
                                url: finalUrl,
                                imageUrl: ''
                            });

                            if (liveDeals.length >= limit) break;
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`Failed to fetch live RSS deals for ${category}:`, err.message);
        }

        // Fallback: If we didn't find enough live deals (limit of 5), fill the rest from local JSON pool
        try {
            const filePath = path.join(__dirname, '..', 'deals', `${category}.json`);
            if (fs.existsSync(filePath)) {
                const rawData = fs.readFileSync(filePath, 'utf8');
                const allItems = JSON.parse(rawData);
                
                const startIndex = (pageNum - 1) * limit;
                let index = startIndex;

                while (liveDeals.length < limit) {
                    const fallbackItem = allItems[index % allItems.length];
                    const baseUrl = fallbackItem.url.trim();
                    const finalUrl = (baseUrl + cleanAffiliateParams).trim();

                    liveDeals.push({
                        id: fallbackItem.id,
                        title: fallbackItem.title,
                        price: fallbackItem.price,
                        promoType: fallbackItem.promoType || null,
                        url: finalUrl,
                        imageUrl: fallbackItem.imageUrl ? fallbackItem.imageUrl.trim() : ''
                    });

                    index++;
                }
            }
        } catch (err) {
            console.error(`Error loading fallback deals for ${category}:`, err.message);
        }

        return liveDeals.slice(0, limit);
    } else {
        // Shein Category: Local pool fallback
        try {
            const filePath = path.join(__dirname, '..', 'deals', `${category}.json`);
            if (!fs.existsSync(filePath)) {
                console.error(`Local deal pool file not found: ${filePath}`);
                return [];
            }
            
            const rawData = fs.readFileSync(filePath, 'utf8');
            const allItems = JSON.parse(rawData);

            const maxPages = Math.max(Math.ceil(allItems.length / limit), 1);
            const actualPageNum = Math.min(pageNum, maxPages);

            const startIndex = (actualPageNum - 1) * limit;
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
