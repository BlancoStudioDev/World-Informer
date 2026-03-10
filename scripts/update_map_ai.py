import json
import requests
import os
import time

GROQ_API_KEY = "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"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

def generate_map_data():
    # Load ANSA data
    try:
        with open("data_ansa.json", "r", encoding="utf-8") as f:
            ansa_data = json.load(f)
    except FileNotFoundError:
        print("data_ansa.json not found.")
        return

def generate_map_data():
    # Construct paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Assuming script is in scripts/ folder, so root is parent
    root_dir = os.path.dirname(script_dir)
    data_dir = os.path.join(root_dir, "data")
    
    ansa_path = os.path.join(data_dir, "data_ansa.json")
    map_path = os.path.join(data_dir, "map_data.json")

    # Load ANSA data
    try:
        with open(ansa_path, "r", encoding="utf-8") as f:
            ansa_data = json.load(f)
    except FileNotFoundError:
        print(f"{ansa_path} not found.")
        return

    all_articles = []
    for title, info in ansa_data.items():
        all_articles.append(f"- Title: {title}\n  Link: {info['link']}\n  Summary: {info['content']}")

    # Batch processing
    BATCH_SIZE = 20
    all_map_events = []
    
    total_batches = (len(all_articles) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"Processing {len(all_articles)} articles in {total_batches} batches...")

    for i in range(0, len(all_articles), BATCH_SIZE):
        if i > 0:
            print("  - Sleeping 20s to respect rate limits...")
            time.sleep(20)
            
        batch = all_articles[i:i + BATCH_SIZE]
        articles_chunk = "\n".join(batch)
        
        print(f"  - Batch {i//BATCH_SIZE + 1}/{total_batches}...")

        prompt = f"""
        You are a geopolitical intelligence analyst. Analyze the following news articles and extract distinct events that have a SPECIFIC, physical geographic location (City or specific Region).

        Articles:
        {articles_chunk}

        Rules:
        1. **GOAL**: Extract a location for EVERY article that mentions a specific city, region, or country.
        2. **INCLUDE** all types of news: politics (statements, meetings), justice (court rulings), economy (if related to a place), chronicle, and major cultural events.
        3. **IGNORE** only items that are purely abstract or generic with NO specific location (e.g., "Scientists discover new atom" without a location).
        4. If a politician makes a statement in a city (e.g., "Meloni in Rome"), map it to that city.
        5. For each event, output a JSON object.
        6. **IMPORTANT**: Include the exact "Link" provided in the article source.

        Output format: JSON Array of objects with:
        - "location": City or Country name (in Italian).
        - "lat": Latitude (float).
        - "lng": Longitude (float).
        - "description": Concise summary (in Italian, max 15 words).
        - "severity": "high" (war, disaster, crisis), "medium" (protest, political tension, court/police), "low" (statement, culture, routine).
        - "url": The exact link of the source article.

        Return ONLY the raw JSON array.
        """

        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant that outputs only valid JSON arrays."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1
        }

        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(GROQ_URL, json=payload, headers=headers)
            response.raise_for_status()
            
            content = response.json()['choices'][0]['message']['content']
            content = content.replace("```json", "").replace("```", "").strip()
            
            # Sometimes models return text before JSON, try to find the list bracket
            start_idx = content.find('[')
            end_idx = content.rfind(']')
            if start_idx != -1 and end_idx != -1:
                content = content[start_idx:end_idx+1]
                
            batch_events = json.loads(content)
            
            # Simple deduplication based on location name to avoid stacking too many on exact same spot in one run?
            # Or just append. User asked for "all". Let's append, but maybe filter nulls.
            if isinstance(batch_events, list):
                all_map_events.extend(batch_events)
                print(f"    Found {len(batch_events)} events.")
            
        except Exception as e:
            print(f"    Error in batch {i//BATCH_SIZE + 1}: {e}")
            # Continue to next batch rather than crashing everything

    print(f"Total generated events: {len(all_map_events)}")
    
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(all_map_events, f, ensure_ascii=False, indent=4)

if __name__ == "__main__":
    generate_map_data()
