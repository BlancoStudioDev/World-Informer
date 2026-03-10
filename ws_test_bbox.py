import asyncio
import aiohttp
import json
import logging

logging.basicConfig(level=logging.DEBUG)

API_KEY = "68430160a3e1c230d132d44a01c97d162d0465ac"

async def test():
    # Attempting to subscribe WITHOUT bounding box to see if it makes a difference,
    # or with a very specific small box
    subscribe_message = {
        "APIKey": API_KEY,
        "BoundingBoxes": [[[30.0, -10.0], [45.0, 30.0]]], # Mediterranean
        "FilterMessageTypes": ["PositionReport"]
    }
    
    print("Connecting with aiohttp...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect('wss://stream.aisstream.io/v0/stream', timeout=aiohttp.ClientTimeout(total=30)) as ws:
                print("Connected! Sending subscription...")
                await ws.send_json(subscribe_message)
                
                print("Waiting for data...")
                count = 0
                async for msg in ws:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        data = msg.json()
                        print(f"Received msg: {data}")
                        count += 1
                        if count >= 3:
                            break
                    elif msg.type == aiohttp.WSMsgType.CLOSED:
                        print("Closed")
                        break
                    elif msg.type == aiohttp.WSMsgType.ERROR:
                        print("Error")
                        break
    except Exception as e:
        print(f"Exception: {e}")

asyncio.run(test())
