// Global array to store all articles
let allArticles = [];

// Fetch both data sources
Promise.all([
    fetch("data.json").then(r => r.json()),
    fetch("data_corriere.json").then(r => r.json()),
    fetch("data_ansa.json").then(r => r.json())
]).then(([soleData, corriereData, ansaData]) => {
    // Process Sole 24 Ore data
    for (const title in soleData) {
        allArticles.push({
            source: 'sole',
            title: title,
            ...soleData[title]
        });
    }

    // Process Corriere data
    for (const title in corriereData) {
        allArticles.push({
            source: 'corriere',
            title: title,
            ...corriereData[title]
        });
    }

    // Process ANSA
    for (let title in ansaData) {
        allArticles.push({
            source: 'ansa',
            title: title,
            ...ansaData[title]
        });
    }


    // Initial render
    renderArticles("");
}).catch(err => { console.error("Error loading data:", err); });

// Search input listener
document.getElementById("searchInput").addEventListener("input", (e) => {
    renderArticles(e.target.value);
});

// Map Initialized Once
const map = L.map('worldMap').setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Fetch Map Data Once
fetch("map_data.json")
    .then(r => r.json())
    .then(locations => {
        locations.forEach(loc => {
            const customIcon = L.divIcon({
                className: `blinking-marker ${loc.severity}`,
                iconSize: [20, 20]
            });
            L.marker([loc.lat, loc.lng], { icon: customIcon })
                .addTo(map)
                .bindPopup(`
                    <div style="text-align: center;">
                        <b><a href="${loc.url}" target="_blank">${loc.location}</a></b><br>
                        <span>${loc.description}</span>
                    </div>
                `);
        });
    })
    .catch(err => console.error("Error loading map data:", err));

function renderArticles(filterText) {
    const soleContainer = document.getElementById("news_sole24ore");
    const corriereContainer = document.getElementById("news_corriere");
    const ansaContainer = document.getElementById("news_ansa");


    // Clear current content
    soleContainer.innerHTML = '<h2>Il Sole 24 Ore</h2>';
    corriereContainer.innerHTML = '<h2>Corriere</h2>';
    ansaContainer.innerHTML = '<h2>ANSA</h2>';


    const lowerFilter = filterText.toLowerCase();

    allArticles.forEach(article => {
        // Filter logic: check title or content
        const titleMatch = article.title.toLowerCase().includes(lowerFilter);
        const contentMatch = article.content && article.content.toLowerCase().includes(lowerFilter);

        if (titleMatch || contentMatch) {
            const el = document.createElement("article");
            let contentSnippet = article.content ? article.content.substring(0, 150) + "..." : "";

            el.innerHTML = `
            <h3><a href="${article.link}" target="_blank">${article.title}</a></h3>
            <p>${contentSnippet}</p>
            `;

            if (article.source === 'sole') {
                soleContainer.appendChild(el);
            } else if (article.source === 'corriere') {
                corriereContainer.appendChild(el);
            } else if (article.source === 'ansa') {
                ansaContainer.appendChild(el);
            }

        }
    });
}