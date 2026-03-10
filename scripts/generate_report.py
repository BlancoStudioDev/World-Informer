import json
import os
import time
from datetime import datetime
import re
from collections import Counter

# Configuration
DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")
OUTPUT_FILE = os.path.join(DATA_DIR, "report_daily.json")

# Stopwords
STOPWORDS_ITA = ["il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "a", "da", "in", "con", "su", "per", "tra", "fra", "e", "o", "ma", "che", "perché", "chi", "quale", "quanto", "ed", "è", "sono", "era", "hanno", "ha", "del", "al", "ai", "degli", "delle", "sull", "nell", "dell", "questo", "quello", "non", "si", "mi", "ti", "ci", "vi", "si", "loro", "suo", "sua", "suoi", "sue", "stato", "stata", "stati", "state", "uno", "però", "nelle", "dalla", "dalle", "degli", "anche"]
STOPWORDS_ENG = ["the", "and", "for", "with", "that", "this", "from", "after", "said", "says", "about", "will", "over", "into", "their"]
ALL_STOPWORDS = set(STOPWORDS_ITA + STOPWORDS_ENG)

# Geographic keywords to detect focus areas
GEO_KEYWORDS = {
    "Medio Oriente": ["iran", "iraq", "siria", "syria", "libano", "lebanon", "gaza", "palestina", "israel", "israele", "yemen", "hezbollah", "hamas", "medio oriente", "middle east", "tehran", "beirut"],
    "Europa": ["europa", "europe", "bruxelles", "brussels", "nato", "ue", "eu", "francia", "france", "germania", "germany", "uk", "britain", "londra", "london", "parigi", "paris", "berlino", "berlin", "ucraina", "ukraine", "kiev", "kyiv"],
    "USA": ["usa", "stati uniti", "united states", "washington", "trump", "biden", "white house", "casa bianca", "pentagon", "pentagono", "congress", "congresso", "america"],
    "Russia": ["russia", "mosca", "moscow", "putin", "cremlino", "kremlin", "russian"],
    "Cina": ["cina", "china", "pechino", "beijing", "taiwan", "xi jinping", "chinese", "cinese"],
    "Africa": ["africa", "sudan", "libia", "libya", "etiopia", "ethiopia", "nigeria", "congo", "egitto", "egypt", "cairo"],
    "Italia": ["italia", "italy", "roma", "rome", "milano", "milan", "governo", "parlamento", "meloni", "mattarella", "italiano", "italiana"],
    "Asia": ["india", "pakistan", "giappone", "japan", "corea", "korea", "indonesia", "filippine", "philippines", "bangladesh"]
}

# Category keywords
CATEGORY_KEYWORDS = {
    "Geopolitica": ["guerra", "war", "conflitto", "conflict", "missili", "missiles", "attacco", "attack", "militare", "military", "armi", "weapons", "difesa", "defense", "sanzioni", "sanctions", "tregua", "ceasefire", "bombardamento"],
    "Economia": ["economia", "economy", "mercati", "markets", "borsa", "stock", "inflazione", "inflation", "banca", "bank", "pil", "gdp", "dollaro", "euro", "petrolio", "oil", "gas", "investimenti", "trade", "commercio"],
    "Politica": ["elezioni", "elections", "voto", "vote", "presidente", "president", "governo", "government", "parlamento", "parliament", "partito", "party", "legge", "law", "riforma", "reform"],
    "Tecnologia": ["tech", "tecnologia", "ai", "intelligenza artificiale", "artificial intelligence", "cyber", "digitale", "digital", "space", "spazio", "satellite"],
    "Emergenze": ["terremoto", "earthquake", "alluvione", "flood", "uragano", "hurricane", "incendio", "fire", "emergenza", "emergency", "vittime", "casualties", "morti", "dead"]
}

def clean_text(text):
    if not text: return ""
    text = re.sub('<[^<]+?>', '', text)
    text = re.sub(r'[^\w\s]', ' ', text.lower())
    return text

def get_last_24h_news():
    now = time.time()
    day_ago = now - (24 * 3600)
    
    news_sources = [
        "data_ansa.json", "data_ansa_detailed.json", "data_ansa_ultima_ora.json",
        "data_aljazeera.json", "data_bbc.json", "data_cnn.json",
        "data_corriere.json", "data_guardian.json", "data_sole24ore.json",
        "data_telegram.json"
    ]
    
    news_items = []
    for filename in news_sources:
        filepath = os.path.join(DATA_DIR, filename)
        if not os.path.exists(filepath): continue
        source_name = filename.replace("data_", "").replace(".json", "")
        
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = json.load(f)
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and item.get("scraped_at", 0) >= day_ago:
                            item["source_file"] = source_name
                            news_items.append(item)
                elif isinstance(content, dict):
                    if source_name == "ansa_ultima_ora":
                        for cat, articles in content.items():
                            if isinstance(articles, list):
                                for art in articles:
                                    if isinstance(art, dict) and art.get("scraped_at", 0) >= day_ago:
                                        art["source_file"] = source_name
                                        art["category"] = cat
                                        news_items.append(art)
                    else:
                        for title, info in content.items():
                            if isinstance(info, dict) and info.get("scraped_at", 0) >= day_ago:
                                info["title"] = title
                                info["source_file"] = source_name
                                news_items.append(info)
        except Exception: continue
    return news_items

def analyze_day_at_glance(news_items):
    """Build a 'Day at a Glance' overview with genuinely useful metrics."""
    
    # 1. Activity Timeline — group by 3-hour blocks
    hour_counts = Counter()
    for item in news_items:
        ts = item.get("scraped_at", 0)
        if ts:
            h = datetime.fromtimestamp(ts).hour
            slot = f"{(h // 3) * 3:02d}:00-{(h // 3) * 3 + 2:02d}:59"
            hour_counts[slot] += 1
    
    peak_slot = hour_counts.most_common(1)[0] if hour_counts else ("N/A", 0)
    timeline = [{"slot": s, "count": c} for s, c in sorted(hour_counts.items())]
    
    # 2. Geographic Focus — where is the world looking?
    geo_scores = {}
    for item in news_items:
        text = clean_text((item.get("title", "") or "") + " " + (item.get("content", "") or item.get("text", "") or ""))
        for region, keywords in GEO_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in text)
            if score > 0:
                geo_scores[region] = geo_scores.get(region, 0) + score
    
    geo_focus = sorted(geo_scores.items(), key=lambda x: x[1], reverse=True)[:6]
    
    # 3. Category Breakdown — what topics dominate?
    cat_scores = {}
    for item in news_items:
        text = clean_text((item.get("title", "") or "") + " " + (item.get("content", "") or item.get("text", "") or ""))
        for cat, keywords in CATEGORY_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in text)
            if score > 0:
                cat_scores[cat] = cat_scores.get(cat, 0) + score
    
    categories = sorted(cat_scores.items(), key=lambda x: x[1], reverse=True)
    
    # 4. International vs Domestic ratio
    ita_count = geo_scores.get("Italia", 0)
    intl_count = sum(v for k, v in geo_scores.items() if k != "Italia")
    
    return {
        "total_articles": len(news_items),
        "peak_hour": {"slot": peak_slot[0], "count": peak_slot[1]},
        "timeline": timeline,
        "geo_focus": [{"region": r, "mentions": c} for r, c in geo_focus],
        "categories": [{"name": c, "score": s} for c, s in categories],
        "domestic_vs_international": {
            "italia": ita_count,
            "international": intl_count
        }
    }

def cluster_stories(news_items):
    """Group news that share high title similarity into 'Major Stories'."""
    stories = []
    processed_indices = set()
    
    tokenized_news = []
    for item in news_items:
        title = item.get("title") or item.get("text", "")[:100]
        words = set([w for w in clean_text(title).split() if w not in ALL_STOPWORDS and len(w) > 3])
        tokenized_news.append({"item": item, "words": words, "title": title})

    for i in range(len(tokenized_news)):
        if i in processed_indices: continue
        
        current_cluster = [tokenized_news[i]]
        processed_indices.add(i)
        
        for j in range(i + 1, len(tokenized_news)):
            if j in processed_indices: continue
            common = tokenized_news[i]["words"].intersection(tokenized_news[j]["words"])
            if len(common) >= 3:
                current_cluster.append(tokenized_news[j])
                processed_indices.add(j)
        
        if len(current_cluster) > 1:
            stories.append(current_cluster)

    stories.sort(key=len, reverse=True)
    
    formatted = []
    for story in stories[:5]:
        main = story[0]
        formatted.append({
            "headline": main["title"],
            "count": len(story),
            "source": main["item"]["source_file"],
            "related": [s["title"] for s in story[1:4]],
            "link": main["item"].get("link") or main["item"].get("url")
        })
    return formatted

def generate_report():
    print("Generating Daily Intelligence Digest...")
    news = get_last_24h_news()
    if not news:
        print("No news found in last 24h.")
        report = {
            "generated_at": int(time.time()),
            "total_count": 0,
            "day_at_glance": None,
            "major_stories": [],
            "sources_volume": {},
            "latest_headlines": []
        }
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=4)
        return

    # 1. Day at a Glance (replaces trending_phrases)
    glance = analyze_day_at_glance(news)
    
    # 2. Story Clustering
    major_stories = cluster_stories(news)
    
    # 3. Source Distribution
    sources_volume = Counter([n.get("source_file", "unknown") for n in news])
    
    # 4. Latest Headlines
    latest = sorted(news, key=lambda x: x.get("scraped_at", 0), reverse=True)[:10]

    report = {
        "generated_at": int(time.time()),
        "total_count": len(news),
        "day_at_glance": glance,
        "major_stories": major_stories,
        "sources_volume": dict(sources_volume),
        "latest_headlines": [
            {"title": n.get("title") or n.get("text", "")[:100], "link": n.get("link") or n.get("url"), "source": n.get("source_file")}
            for n in latest
        ]
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=4)
    print(f"Digest saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_report()
