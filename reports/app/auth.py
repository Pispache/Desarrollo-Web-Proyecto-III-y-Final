import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

security = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ISSUER = os.getenv("JWT_ISSUER", "MarcadorApi")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "MarcadorUi")


def require_admin(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="JWT not configured")
    token = creds.credentials
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
        )
        roles = payload.get("role") or payload.get("roles")
        if isinstance(roles, str):
            roles = [roles]
        if not roles or "ADMIN" not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
