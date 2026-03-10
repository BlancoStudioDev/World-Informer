"""
Telegram OSINT Channel Scraper
Fetches latest messages from public Telegram channels via web preview (no API key needed).
Uses BeautifulSoup to parse the HTML preview page.
"""
import requests
from bs4 import BeautifulSoup
import json
import os
from datetime import datetime

# OSINT channels to scrape
CHANNELS = [
    "liveuamap",
    "clashreport",
    "osinttechnical",
    "DDGeopolitics",       # DD Geopolitics
    "UAWeapons",           # Ukraine Weapons Tracker
    "intel_slava",         # Intel Slava Z — conflict zone updates
    "SouthFrontEng",       # South Front — military analysis
    "TheIntelCrab",        # The Intel Crab — verified OSINT
    "warmonitors",         # War Monitor
    "nexaborona",          # NEXTA — Eastern Europe
    "ryaborona",           # Rybar — military maps & analysis
    "militaryoperations",  # Global military operations
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def scrape_channel(channel_name):
    """Scrape last messages from a Telegram channel's web preview."""
    url = f"https://t.me/s/{channel_name}"
    
    print(f"  Scraping @{channel_name}...")
    
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        
        if response.status_code != 200:
            print(f"    Failed ({response.status_code})")
            return []
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        messages = []
        message_widgets = soup.find_all('div', class_='tgme_widget_message_wrap')
        
        for widget in message_widgets[-20:]:  # Last 20 messages
            try:
                # Message container
                msg_div = widget.find('div', class_='tgme_widget_message')
                if not msg_div:
                    continue
                
                # Message text
                text_div = msg_div.find('div', class_='tgme_widget_message_text')
                text = text_div.get_text(strip=True) if text_div else ""
                
                if not text:
                    continue
                
                # Message link
                msg_link = ""
                link_attr = msg_div.get('data-post', '')
                if link_attr:
                    msg_link = f"https://t.me/{link_attr}"
                
                # Date/time
                time_tag = msg_div.find('time')
                date_str = ""
                if time_tag:
                    date_str = time_tag.get('datetime', '')
                
                # Images
                images = []
                photo_wraps = msg_div.find_all('a', class_='tgme_widget_message_photo_wrap')
                for pw in photo_wraps:
                    style = pw.get('style', '')
                    # Extract URL from background-image style
                    if "background-image:url('" in style:
                        img_url = style.split("background-image:url('")[1].split("')")[0]
                        images.append(img_url)
                
                # Forward info (if forwarded from another channel)
                fwd_name = ""
                fwd_tag = msg_div.find('a', class_='tgme_widget_message_forwarded_from_name')
                if fwd_tag:
                    fwd_name = fwd_tag.get_text(strip=True)
                
                messages.append({
                    "channel": channel_name,
                    "text": text[:500],  # Truncate long messages
                    "date": date_str,
                    "url": msg_link,
                    "images": images[:3],  # Max 3 images
                    "forwarded_from": fwd_name,
                    "scraped_at": int(datetime.now().timestamp())
                })
                
            except Exception as e:
                continue
        
        print(f"    Found {len(messages)} messages")
        return messages
        
    except requests.exceptions.RequestException as e:
        print(f"    Network error: {e}")
        return []

def scrape_telegram():
    all_messages = []
    
    print("Starting Telegram OSINT scraper...")
    
    for channel in CHANNELS:
        channel_msgs = scrape_channel(channel)
        all_messages.extend(channel_msgs)
    
    # Sort by date (newest first)
    all_messages.sort(key=lambda m: m.get('date', ''), reverse=True)
    
    print(f"\nTotal Telegram messages: {len(all_messages)}")
    
    # Save
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, '..', 'data', 'data_telegram.json')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_messages, f, ensure_ascii=False, indent=2)
    
    print(f"Saved to {output_path}")

if __name__ == '__main__':
    scrape_telegram()
