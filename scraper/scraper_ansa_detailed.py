import requests
from bs4 import BeautifulSoup
import json
import os
import time
import shutil
from urllib.parse import urljoin, urlparse

# Configuration
BASE_URL = "https://www.ansa.it"
CATEGORIES = [
    {
        "name": "Mondo",
        "url": "https://www.ansa.it/sito/notizie/mondo/mondo.shtml",
        "base_url": "https://www.ansa.it/sito/notizie/mondo/"
    },
    {
        "name": "Economia",
        "url": "https://www.ansa.it/sito/notizie/economia/economia.shtml",
        "base_url": "https://www.ansa.it/sito/notizie/economia/"
    },
    {
        "name": "Politica",
        "url": "https://www.ansa.it/sito/notizie/politica/politica.shtml", 
        "base_url": "https://www.ansa.it/sito/notizie/politica/" # Assuming politics path
    }
]

# Path Setup
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "data")
MEDIA_DIR = os.path.join(DATA_DIR, "media", "ansa")
OUTPUT_JSON = os.path.join(DATA_DIR, "ansa_notebooklm_data.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

def setup_dirs():
    if not os.path.exists(MEDIA_DIR):
        os.makedirs(MEDIA_DIR)
    # Clean up old media? Maybe optional. For now, let's keep it additive or overwrite by name.

def download_image(img_url, slug, index):
    try:
        response = requests.get(img_url, headers=HEADERS, stream=True, timeout=10)
        if response.status_code == 200:
            # Get extension
            ext = os.path.splitext(urlparse(img_url).path)[1]
            if not ext or len(ext) > 5:
                ext = ".jpg"
            
            filename = f"{slug}_{index}{ext}"
            filepath = os.path.join(MEDIA_DIR, filename)
            
            with open(filepath, 'wb') as f:
                response.raw.decode_content = True
                shutil.copyfileobj(response.raw, f)
            
            return filepath
    except Exception as e:
        print(f"    Error downloading image {img_url}: {e}")
    return None

def scrape_article_details(article_url, category):
    try:
        time.sleep(0.5) # Politeness
        r = requests.get(article_url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return None
        
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # Title - usually in header h1
        title_tag = soup.find("h1", class_="news-title") or soup.find("h1")
        title = title_tag.get_text(strip=True) if title_tag else "No Title"
        
        # Summary/Description
        summary_tag = soup.find("h2", class_="news-sub-title") or soup.find("p", class_="summary")
        description = summary_tag.get_text(strip=True) if summary_tag else ""
        
        # Content - div.news-txt is common in ANSA
        content_div = soup.find("div", class_="news-txt")
        if not content_div:
            # Fallback
            content_div = soup.find("div", class_="article-content")
            
        content = ""
        if content_div:
            # Get text from paragraphs
            paragraphs = content_div.find_all("p")
            content = "\n\n".join([p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)])
        
        # Images
        image_urls = []
        # Look for images in the article
        # Check standard article image container
        img_containers = soup.select("div.img-photo img") + soup.select("div.big-photo img") + (content_div.find_all("img") if content_div else [])
        
        for img in img_containers:
            src = img.get("src")
            if src:
                if not src.startswith("http"):
                    src = urljoin(BASE_URL, src)
                # Filter out small icons or irrelevant stuff if possible
                if "icon" not in src and "logo" not in src:
                     if src not in image_urls:
                        image_urls.append(src)

        # Fallback/Supplemental: Check Meta tags (og:image)
        if not image_urls:
            og_image = soup.find("meta", property="og:image")
            if og_image:
                src = og_image.get("content")
                if src and src.startswith("http") and "placeholder" not in src:
                     image_urls.append(src)
                        
        # Also check for 'top visual'
        # Sometimes it's in a different div
        
        return {
            "title": title,
            "description": description,
            "content": content,
            "image_urls": image_urls
        }

    except Exception as e:
        print(f"  Error scraping details for {article_url}: {e}")
        return None

def main():
    setup_dirs()
    print(f"Starting detailed scraper. Saving media to {MEDIA_DIR}")
    
    all_data = []
    total_images = 0
    MAX_ARTICLES_PER_CAT = 10 # Limit to ensure we don't explode the file count (3 cats * 10 = 30 articles + ~60 images = <100 files, safe within 300 limit)
    
    for cat in CATEGORIES:
        print(f"Scraping category: {cat['name']}")
        
        try:
            r = requests.get(cat['url'], headers=HEADERS)
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # Find article links
            # h3.title > a is common
            links = soup.select("h3.title > a")
            
            count = 0
            for link in links:
                if count >= MAX_ARTICLES_PER_CAT:
                    break
                
                href = link.get('href')
                if not href: continue
                
                full_url = urljoin(BASE_URL, href) if not href.startswith("http") else href
                
                # Check duplication in this run
                # (Skipping check for simplicity, assuming unique links on page)
                
                print(f"  Processing: {full_url}")
                
                details = scrape_article_details(full_url, cat['name'])
                
                if details and details['content']:
                    # Slug for filenames
                    slug = full_url.split("/")[-1].replace(".html", "").replace(".shtml", "")
                    if not slug: slug = f"doc_{len(all_data)}"
                    
                    local_images = []
                    for idx, img_url in enumerate(details['image_urls']):
                        # Limit images per article to avoid junk
                        if idx >= 3: break 
                        
                        local_path = download_image(img_url, slug, idx)
                        if local_path:
                            local_images.append(local_path)
                            total_images += 1
                    
                    record = {
                        "category": cat['name'],
                        "title": details['title'],
                        "link": full_url,
                        "description": details['description'],
                        "content": details['content'],
                        "local_images": local_images
                    }
                    
                    all_data.append(record)
                    count += 1
                    
        except Exception as e:
            print(f"Error scraping category {cat['name']}: {e}")
            
    print(f"Scraping complete. Processed {len(all_data)} articles. Downloaded {total_images} images.")
    
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=False, indent=4)
        
    print(f"Data saved to {OUTPUT_JSON}")
    
    # Save as TXT for NotebookLM
    OUTPUT_TXT = os.path.join(DATA_DIR, "ansa_notebooklm_data.txt")
    with open(OUTPUT_TXT, "w", encoding="utf-8") as f:
        for idx, item in enumerate(all_data):
            f.write(f"--- ARTICOLO {idx+1} ---\n")
            f.write(f"TITOLO: {item['title']}\n")
            f.write(f"CATEGORIA: {item['category']}\n")
            f.write(f"LINK: {item['link']}\n")
            f.write(f"DESCRIZIONE: {item['description']}\n")
            f.write(f"CONTENUTO COMPLETO:\n{item['content']}\n")
            
            if item['local_images']:
                f.write("IMMAGINI LOCALI SCARICATE:\n")
                for img_path in item['local_images']:
                    f.write(f"- {img_path}\n")
            else:
                f.write("NESSUNA IMMAGINE LOCALE TROVATA\n")
            
            f.write("\n")
            
    print(f"Data saved to {OUTPUT_TXT}")

if __name__ == "__main__":
    main()
