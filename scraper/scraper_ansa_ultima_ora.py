import requests
from bs4 import BeautifulSoup
import json
import os
import time

def scrape_ansa_ultima_ora():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    urls = {
        "Mondo": "https://www.ansa.it/sito/notizie/mondo/index.shtml",
        "Economia": "https://www.ansa.it/sito/notizie/economia/index.shtml"
    }
    
    results = {}

    print("Starting ANSA Ultima Ora scraper...")

    for category, url in urls.items():
        print(f"Scraping {category} from {url}...")
        try:
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code != 200:
                print(f"Failed to fetch {url} (Status {response.status_code})")
                continue
            
            soup = BeautifulSoup(response.text, 'html.parser')
            box = soup.find("section", class_="side-latest-news")
            
            if not box:
                print(f"Could not find 'side-latest-news' section on {url}")
                continue
            
            articles = []
            teaser_divs = box.find_all("div", class_="article-teaser")
            
            for teaser in teaser_divs:
                time_elem = teaser.find("p", class_="kicker")
                title_elem = teaser.find("h3", class_="title")
                
                if time_elem and title_elem:
                    link_tag = title_elem.find("a")
                    if link_tag:
                        title = link_tag.get_text(strip=True)
                        relative_link = link_tag.get("href")
                        full_link = "https://www.ansa.it" + relative_link if relative_link.startswith("/") else relative_link
                        news_time = time_elem.get_text(strip=True)
                        
                        articles.append({
                            "time": news_time,
                            "title": title,
                            "link": full_link,
                            "scraped_at": int(time.time())
                        })
            
            results[category] = articles
            print(f"Found {len(articles)} articles for {category}")

        except Exception as e:
            print(f"Error scraping {category}: {e}")

    # Save to data/data_ansa_ultima_ora.json
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "../data/data_ansa_ultima_ora.json")
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=4)
        
    print(f"Saved results to {output_path}")

if __name__ == "__main__":
    scrape_ansa_ultima_ora()
