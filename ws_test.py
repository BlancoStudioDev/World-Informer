import asyncio
import websockets
import json

API_KEY = "68430160a3e1c230d132d44a01c97d162d0465ac"

async def connect_ais_stream():
    subscribe_message = {
        "APIKey": API_KEY,
        "BoundingBoxes": [[[-90, -180], [90, 180]]]
    }

    try:
        async with websockets.connect("wss://stream.aisstream.io/v0/stream") as websocket:
            subscribe_message_json = json.dumps(subscribe_message)
            await websocket.send(subscribe_message_json)
            
            print("Connected and subscribed, waiting for messages...")
            count = 0
            
            async for message_json in websocket:
                message = json.loads(message_json)
                message_type = message["MessageType"]

                if message_type == "PositionReport":
                    ais_message = message['Message']['PositionReport']
                    print(f"[{count}] ShipId: {ais_message['UserID']} Latitude: {ais_message['Latitude']} Longitude: {ais_message['Longitude']}")
                else:
                    print(f"[{count}] Other msg: {message_type}")
                    
                count += 1
                if count >= 10:
                    break
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(connect_ais_stream())
