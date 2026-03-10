import requests
from bs4 import BeautifulSoup
import json
import time

url = "https://www.corriere.it/"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

print("Inizio scraping della home page...")
try:
    r = requests.get(url, headers=headers)
    r.raise_for_status()
except Exception as e:
    print(f"Errore nella richiesta alla home page: {e}")
    exit(1)

soup = BeautifulSoup(r.text, "html.parser")

data = {}

# Trova gli articoli dalla home page
# Basato su esempio.txt: h4 class="title-art-hp"
articles = soup.find_all("h4", class_="title-art-hp")
print(f"Trovati {len(articles)} potenziali articoli.")

for h4 in articles:
    a_tag = h4.find("a", href=True)
    if not a_tag:
        continue

    title = a_tag.text.strip()
    link = a_tag["href"]

    # Gestione link relativi
    if not link.startswith("http"):
        link = "https:" + link if link.startswith("//") else "https://www.corriere.it" + link
    
    # Ignora link non pertinenti o sezioni
    if "corriere.it" not in link:
        continue

    print(f"Titolo: {title}")
    print(f"Link: {link}\n")
    
    data[title] = {"link": link, "content": "", "scraped_at": int(time.time())}

print("Inizio scraping dei contenuti degli articoli...")

# Itera sugli articoli per estrarre il contenuto
for title, info in data.items():
    link = info["link"]
    print(f"Scraping contenuto: {title[:50]}...")
    
    try:
        r_art = requests.get(link, headers=headers)
        r_art.raise_for_status()
        soup_art = BeautifulSoup(r_art.text, "html.parser")
        
        content_parts = []
        # Basato su analisi curl: p class="chapter-paragraph"
        paragraphs = soup_art.find_all("p", class_="chapter-paragraph")
        
        if not paragraphs:
            # Fallback per alcuni layout diversi, prova solo p generici in article o div principali
            # Ma per ora atteniamoci al piano principale
            pass

        for p in paragraphs:
            text = p.text.strip()
            if text:
                content_parts.append(text)
        
        if content_parts:
            data[title]["content"] = " ".join(content_parts)
        else:
            print(f"  Nessun contenuto trovato per {link}")

        # Rispetto per il server
        time.sleep(0.5)
        
    except Exception as e:
        print(f"  Errore nel recupero di {link}: {e}")

# Filtra articoli senza contenuto rilevante
data_filtered = {k: v for k, v in data.items() if v["content"] and len(v["content"]) > 50}

import os
# Construct path to data/data_corriere.json relative to this script
script_dir = os.path.dirname(os.path.abspath(__file__))
data_path = os.path.join(script_dir, "../data/data_corriere.json")

print(f"\nSalvataggio di {len(data_filtered)} articoli in {data_path}")

with open(data_path, "w", encoding="utf-8") as f:
    json.dump(data_filtered, f, ensure_ascii=False, indent=4)