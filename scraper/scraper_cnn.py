import requests
import json
import os
import xml.etree.ElementTree as ET
import time

def scrape_cnn():
    rss_url = "http://rss.cnn.com/rss/edition_world.rss"
    data = {}
    
    print("Starting CNN World scraper...")
    
    try:
        # CNN often blocks default user agents on RSS too, so we fake a browser
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(rss_url, headers=headers, timeout=15)
        
        if response.status_code == 200:
            root = ET.fromstring(response.content)
            channel = root.find("channel")
            
            if channel:
                items = channel.findall("item")
                print(f"Found {len(items)} items in RSS feed.")
                
                for item in items:
                    title = item.find("title").text if item.find("title") is not None else "No Title"
                    link = item.find("link").text if item.find("link") is not None else ""
                    # CNN descriptions often contain CDATA or HTML, but .text usually extracts it raw.
                    description = item.find("description").text if item.find("description") is not None else ""
                    pubDate = item.find("pubDate").text if item.find("pubDate") is not None else ""
                    
                    if title and link:
                        # Clean up CNN titles (sometimes have 'VIDEOCheck out...')
                        data[title] = {
                            "link": link,
                            "content": description.split("<")[0], # Simple strip of potential HTML tags at start
                            "source": "cnn",
                            "date": pubDate,
                            "category": "World",
                            "scraped_at": int(time.time())
                        }
        else:
            print(f"Failed to fetch RSS feed (Status {response.status_code})")
            
    except Exception as e:
        print(f"Error scraping CNN: {e}")

    print(f"Scraped {len(data)} articles from CNN.")
    
    # Save Paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, "../data")
    
    json_path = os.path.join(output_dir, "data_cnn.json")
    txt_path = os.path.join(output_dir, "data_cnn.txt")
    
    # Save JSON
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        
    # Save TXT
    with open(txt_path, "w", encoding="utf-8") as f:
        for title, info in data.items():
            f.write(f"--- ARTICLE ---\n")
            f.write(f"TITLE: {title}\n")
            f.write(f"DATE: {info.get('date', '')}\n")
            f.write(f"LINK: {info.get('link', '')}\n")
            f.write(f"SUMMARY: {info.get('content', '')}\n")
            f.write("\n")
            
    print(f"Data saved to {json_path} and {txt_path}")

if __name__ == "__main__":
    scrape_cnn()
