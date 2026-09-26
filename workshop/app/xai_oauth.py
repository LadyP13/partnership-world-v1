"""xAI SuperGrok / X Premium+ OAuth helpers for the workshop.

Device-code flow mirrors OpenClaw / Grok CLI public client.
Also can borrow a live Grok Build session from ~/.grok/auth.json
when the builder is already signed in on this machine.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Optional

import httpx

XAI_OAUTH_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828"
XAI_OAUTH_SCOPE = "openid profile email offline_access grok-cli:access api:access"
XAI_OAUTH_ISSUER = "https://auth.x.ai"
XAI_OAUTH_DISCOVERY_URL = f"{XAI_OAUTH_ISSUER}/.well-known/openid-configuration"
XAI_DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
XAI_USER_AGENT = "PartnershipWorld-Workshop/1.0 (Grok Home)"
GROK_BUILD_AUTH = Path.home() / ".grok" / "auth.json"


def _trusted(url: str) -> bool:
    try:
        from urllib.parse import urlparse

        p = urlparse(url)
        return p.scheme == "https" and (p.hostname == "x.ai" or (p.hostname or "").endswith(".x.ai"))
    except Exception:
        return False


async def fetch_discovery() -> dict[str, str]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            XAI_OAUTH_DISCOVERY_URL,
            headers={"Accept": "application/json", "User-Agent": XAI_USER_AGENT},
        )
        resp.raise_for_status()
        data = resp.json()
    device = data.get("device_authorization_endpoint")
    token = data.get("token_endpoint")
    if not isinstance(device, str) or not isinstance(token, str):
        raise RuntimeError("xAI OAuth discovery missing endpoints")
    if not _trusted(device) or not _trusted(token):
        raise RuntimeError("xAI OAuth discovery returned untrusted endpoints")
    return {"deviceAuthorizationEndpoint": device, "tokenEndpoint": token}


async def start_device_login() -> dict[str, Any]:
    discovery = await fetch_discovery()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            discovery["deviceAuthorizationEndpoint"],
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": XAI_USER_AGENT,
            },
            data={"client_id": XAI_OAUTH_CLIENT_ID, "scope": XAI_OAUTH_SCOPE},
        )
        resp.raise_for_status()
        data = resp.json()

    device_code = data.get("device_code")
    user_code = data.get("user_code")
    verification_uri = data.get("verification_uri")
    if not all(isinstance(x, str) and x for x in (device_code, user_code, verification_uri)):
        raise RuntimeError("Incomplete device code response from xAI")
    if not _trusted(verification_uri):
        raise RuntimeError("Untrusted verification URI")

    complete = data.get("verification_uri_complete")
    if isinstance(complete, str) and complete and not _trusted(complete):
        complete = None

    return {
        "deviceCode": device_code,
        "userCode": user_code,
        "verificationUri": verification_uri,
        "verificationUriComplete": complete,
        "expiresIn": int(data.get("expires_in") or 300),
        "interval": int(data.get("interval") or 5),
        "tokenEndpoint": discovery["tokenEndpoint"],
    }


async def poll_device_token(
    device_code: str,
    token_endpoint: str,
    expires_in: int = 300,
    interval: int = 5,
) -> dict[str, Any]:
    if not _trusted(token_endpoint):
        raise RuntimeError("Untrusted token endpoint")

    deadline = time.time() + expires_in
    wait = max(interval, 1)

    async with httpx.AsyncClient(timeout=30.0) as client:
        while time.time() < deadline:
            resp = await client.post(
                token_endpoint,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "User-Agent": XAI_USER_AGENT,
                },
                data={
                    "grant_type": XAI_DEVICE_CODE_GRANT,
                    "client_id": XAI_OAUTH_CLIENT_ID,
                    "device_code": device_code,
                },
            )
            try:
                body = resp.json()
            except Exception:
                body = {}

            if resp.is_success:
                return _normalize_tokens(body)

            err = body.get("error")
            if err == "authorization_pending":
                await _async_sleep(wait)
                continue
            if err == "slow_down":
                wait += 5
                await _async_sleep(wait)
                continue
            if err in ("access_denied", "authorization_denied"):
                raise RuntimeError("SuperGrok login was denied")
            if err == "expired_token":
                raise RuntimeError("Device code expired — start login again")
            desc = body.get("error_description") or err or resp.status_code
            raise RuntimeError(f"Token exchange failed: {desc}")

    raise RuntimeError("SuperGrok login timed out")


async def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    discovery = await fetch_discovery()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            discovery["tokenEndpoint"],
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": XAI_USER_AGENT,
            },
            data={
                "grant_type": "refresh_token",
                "client_id": XAI_OAUTH_CLIENT_ID,
                "refresh_token": refresh_token,
            },
        )
        if not resp.is_success:
            raise RuntimeError(f"Refresh failed ({resp.status_code}): {resp.text[:200]}")
        tokens = _normalize_tokens(resp.json())
        if not tokens.get("refreshToken"):
            tokens["refreshToken"] = refresh_token
        return tokens


def _normalize_tokens(body: dict) -> dict[str, Any]:
    access = body.get("access_token")
    if not isinstance(access, str) or not access.strip():
        raise RuntimeError("Missing access_token")
    expires_in = body.get("expires_in")
    expires_at = None
    if isinstance(expires_in, (int, float)):
        expires_at = int(time.time() * 1000) + int(expires_in) * 1000
    return {
        "accessToken": access,
        "refreshToken": body.get("refresh_token") if isinstance(body.get("refresh_token"), str) else None,
        "expiresAt": expires_at,
        "loggedInAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


async def _async_sleep(seconds: float) -> None:
    import asyncio

    await asyncio.sleep(seconds)


def try_load_grok_build_tokens() -> Optional[dict[str, Any]]:
    """If Grok Build is signed in on this laptop, reuse that session for the home."""
    if not GROK_BUILD_AUTH.exists():
        return None
    try:
        data = json.loads(GROK_BUILD_AUTH.read_text())
    except Exception:
        return None

    # Grok Build stores keyed by issuer::client_id
    for key, value in data.items():
        if not isinstance(value, dict):
            continue
        access = value.get("key") or value.get("access_token") or value.get("accessToken")
        refresh = value.get("refresh_token") or value.get("refreshToken")
        if not isinstance(access, str) or len(access) < 20:
            continue
        expires_at = None
        exp = value.get("expires_at") or value.get("expiresAt")
        if isinstance(exp, str):
            try:
                from datetime import datetime

                expires_at = int(datetime.fromisoformat(exp.replace("Z", "+00:00")).timestamp() * 1000)
            except Exception:
                expires_at = None
        elif isinstance(exp, (int, float)):
            expires_at = int(exp)
        return {
            "accessToken": access,
            "refreshToken": refresh if isinstance(refresh, str) else None,
            "expiresAt": expires_at,
            "email": value.get("email"),
            "source": "grok-build",
            "loggedInAt": value.get("create_time"),
        }
    return None


def resolve_bearer_from_ai_config(config: dict) -> Optional[str]:
    """Pick the best bearer for outbound xAI calls from workshop AI config."""
    auth_mode = (config.get("authMode") or "api_key").lower()
    oauth = config.get("oauth") if isinstance(config.get("oauth"), dict) else {}

    if auth_mode == "oauth" and oauth.get("accessToken"):
        return oauth["accessToken"]
    if auth_mode == "grok_build":
        build = try_load_grok_build_tokens()
        if build:
            return build["accessToken"]
    api_key = config.get("apiKey") or ""
    if isinstance(api_key, str) and len(api_key) >= 10:
        return api_key
    # Last resort: Grok Build session on this machine
    build = try_load_grok_build_tokens()
    if build:
        return build["accessToken"]
    return None
