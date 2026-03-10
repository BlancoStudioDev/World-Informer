import requests
from bs4 import BeautifulSoup
import json
import time

url = "https://www.ilsole24ore.com/"

headers = {
    "User-Agent": "Mozilla/5.0"
}

r = requests.get(url, headers=headers)
r.raise_for_status()

soup = BeautifulSoup(r.text, "html.parser")


data = {}
i = 0

for article in soup.find_all("article"):
    for h3 in article.find_all("h3"):
        i += 1
        title = h3.text.strip()
        print(f"Titolo: {title}\n")
        
        for a in h3.find_all("a", href=True):
            if a["href"].startswith("/art"):
                link = "https://www.ilsole24ore.com" + a["href"]
            else:
                link = a["href"]
            
            print(f"Link: {link}\n")
            data[title] = {"link": link, "content": [], "scraped_at": int(time.time())}

for title, info in data.items():
    link = info["link"]
    try:
        r = requests.get(link, headers=headers)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        
        content_parts = []
        for p in soup.find_all("p", class_="atext"):
            if p.text != "":
                content_parts.append(p.text.strip())
        
        data[title]["content"] = " ".join(content_parts)
        
    except Exception as e:
        print(f"Errore nel recupero di {link}: {e}")

# Filter out articles with empty content
data = {k: v for k, v in data.items() if v["content"] and v["content"].strip()}

import os
# Construct path to data/data.json relative to this script
script_dir = os.path.dirname(os.path.abspath(__file__))
data_path = os.path.join(script_dir, "../data/data.json")

with open(data_path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=4)
