"""WebSocket connection manager for real-time sync across phone + laptop."""

import json
from typing import Any, Dict, List

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: Dict[str, Any]):
        message = json.dumps(data)
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

    async def send_personal_message(self, websocket: WebSocket, data: Dict[str, Any]):
        try:
            await websocket.send_text(json.dumps(data))
        except Exception:
            self.disconnect(websocket)


ws_manager = WebSocketManager()