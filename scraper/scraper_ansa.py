import requests
from bs4 import BeautifulSoup
import json
import time

def scrape_ansa():
    base_url = "https://www.ansa.it"
    
    categories = [
        {
            "name": "Mondo",
            "base_url": "https://www.ansa.it/sito/notizie/mondo/",
            "first_page": "mondo.shtml"
        },
        {
            "name": "Economia",
            "base_url": "https://www.ansa.it/sito/notizie/economia/",
            "first_page": "economia.shtml"
        },
        {
            "name": "Ultima Ora",
            "base_url": "https://www.ansa.it/sito/notizie/topnews/",
            "first_page": "index.shtml"
        }
    ]
    
    data = {}
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    print("Starting ANSA scraper...")
    
    for category in categories:
        cat_name = category["name"]
        cat_base = category["base_url"]
        cat_first = category["first_page"]
        
        print(f"Scraping category: {cat_name}")
        
        # Iterate from 1 to 10
        for i in range(1, 11):
            if i == 1:
                url = cat_base + cat_first
            else:
                url = cat_base + f"index_{i}.shtml"
                
            print(f"  Scraping page {i}: {url}")
            
            try:
                response = requests.get(url, headers=headers, timeout=10)
                if response.status_code != 200:
                    print(f"  Failed to fetch page {i} (Status {response.status_code})")
                    continue
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Selectors: 
                # Main paginated news seems to be h2.title > a which is standard across sections
                # Also checking other common containers
                
                selectors = ["h2.title > a", "h3.title > a", "div.title > a"]
                titles_found_on_page = 0
                
                for selector in selectors:
                    for link_tag in soup.select(selector):
                        title = link_tag.get_text(strip=True)
                        relative_link = link_tag.get('href')
                        
                        if not relative_link:
                            continue
                            
                        if "javascript:" in relative_link:
                            continue

                        full_link = base_url + relative_link if relative_link.startswith("/") else relative_link
                        
                        # Use title as key to avoid duplicates
                        if title in data:
                            continue
                            
                        titles_found_on_page += 1
                        
                        # Content extraction logic
                        content = ""
                        
                        # Try to find summary in parent (e.g. div.summary or p.summary)
                        parent = link_tag.find_parent("article") or link_tag.find_parent("div", class_="news-teaser") or link_tag.find_parent("div", class_="article-content")
                        
                        if parent:
                            summary_elem = parent.find("div", class_="summary") or parent.find("p", class_="summary")
                            if summary_elem:
                                content = summary_elem.get_text(strip=True)
                        
                        # Fallback: parse URL for slug
                        if not content:
                            try:
                                filename = full_link.split("/")[-1]
                                if "_" in filename:
                                    slug = filename.split("_")[0]
                                else:
                                    slug = filename.replace(".html", "")
                                cleaned_slug = slug.replace("-", " ")
                                content = cleaned_slug.capitalize()
                            except Exception:
                                content = "Visita il link per leggere l'articolo completo."

                        data[title] = {
                            "link": full_link,
                            "content": content,
                            "source": "ansa",
                            "category": cat_name,
                            "scraped_at": int(time.time())
                        }

                print(f"    Found {titles_found_on_page} new articles.")

            except Exception as e:
                print(f"  Error fetching page {i}: {e}")

    print(f"Scraped {len(data)} unique articles in total from ANSA.")
    
    import os
    # Construct path to data/data_ansa.json relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(script_dir, "../data/data_ansa.json")
    
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

    # Also save as TXT
    txt_path = os.path.join(script_dir, "../data/data_ansa.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        for title, info in data.items():
            f.write(f"--- ARTICOLO ---\n")
            f.write(f"TITOLO: {title}\n")
            f.write(f"CATEGORIA: {info.get('category', 'N/A')}\n")
            f.write(f"LINK: {info.get('link', '')}\n")
            f.write(f"CONTENUTO/RIASSUNTO: {info.get('content', '')}\n")
            f.write("\n")
    
    print(f"Data saved to {txt_path}")

if __name__ == "__main__":
    scrape_ansa()
