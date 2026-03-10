import requests
from bs4 import BeautifulSoup
import json
import os
import xml.etree.ElementTree as ET
import time

def scrape_bbc():
    rss_url = "http://feeds.bbci.co.uk/news/world/rss.xml"
    data = {}
    
    print("Starting BBC World scraper...")
    
    try:
        response = requests.get(rss_url, timeout=15)
        if response.status_code == 200:
            # Parse XML
            root = ET.fromstring(response.content)
            
            # Iterate through items
            channel = root.find("channel")
            if channel:
                items = channel.findall("item")
                print(f"Found {len(items)} items in RSS feed.")
                
                for item in items:
                    title = item.find("title").text if item.find("title") is not None else "No Title"
                    link = item.find("link").text if item.find("link") is not None else ""
                    description = item.find("description").text if item.find("description") is not None else ""
                    pubDate = item.find("pubDate").text if item.find("pubDate") is not None else ""
                    
                    # Clean up data
                    if title and link:
                        data[title] = {
                            "link": link,
                            "content": description,
                            "source": "bbc",
                            "date": pubDate,
                            "category": "World",
                            "scraped_at": int(time.time())
                        }
        else:
            print(f"Failed to fetch RSS feed (Status {response.status_code})")
            
    except Exception as e:
        print(f"Error scraping BBC: {e}")

    print(f"Scraped {len(data)} articles from BBC.")
    
    # Save Paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, "../data")
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    json_path = os.path.join(output_dir, "data_bbc.json")
    txt_path = os.path.join(output_dir, "data_bbc.txt")
    
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
    scrape_bbc()
