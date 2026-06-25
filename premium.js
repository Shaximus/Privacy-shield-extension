// Pricing toggle
const pricingOptions = document.querySelectorAll('.pricing-option');
const premiumPrice = document.getElementById('premiumPrice');
const upgradeButton = document.getElementById('upgradeButton');
let selectedPlan = 'lifetime';

pricingOptions.forEach(option => {
    option.addEventListener('click', () => {
        pricingOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        selectedPlan = option.dataset.plan;
        premiumPrice.textContent = option.dataset.price;
    });
});

// Real blocked count from extension storage
function animateCounter() {
    const missedEl = document.getElementById('missedBlocks');
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    browserAPI.storage.local.get(['stats'], (result) => {
        const target = (result.stats && result.stats.totalBlocked) || 0;
        if (target === 0) {
            missedEl.textContent = '0';
            return;
        }
        let current = 0;
        const increment = target / 100;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            missedEl.textContent = Math.floor(current).toLocaleString();
        }, 10);
    });
}

animateCounter();

// Upgrade button handler
upgradeButton.addEventListener('click', () => {
    const checkoutUrls = {
        lifetime: 'https://buy.stripe.com/6oUbJ2e8m2mhcTz1wedAk00?success_url=' + encodeURIComponent('https://reflexionsoftware.com/success.html'),
        annual: 'https://buy.stripe.com/5kQ6oI2pE7GB7zf2AidAk01?success_url=' + encodeURIComponent('https://reflexionsoftware.com/success.html'),
        monthly: 'https://buy.stripe.com/8x27sMaWa4up7zf1wedAk02?success_url=' + encodeURIComponent('https://reflexionsoftware.com/success.html')
    };

    const prices = {
        lifetime: '$249 (one-time payment)',
        annual: '$99/year',
        monthly: '$9.99/month'
    };

    // Open Stripe checkout
    chrome.tabs.create({ url: checkoutUrls[selectedPlan] });
});
