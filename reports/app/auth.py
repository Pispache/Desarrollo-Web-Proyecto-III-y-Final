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
        # Decodificar sin validar audience/issuer (simplificado para compatibilidad)
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False, "verify_iss": False}
        )
        
        print(f"[DEBUG] Token decoded successfully. Payload: {payload}")
        
        # Validar rol ADMIN (consolidar posibles ubicaciones y normalizar)
        roles_collected = []
        std_claim = payload.get("http://schemas.microsoft.com/ws/2008/06/identity/claims/role")
        if std_claim:
            if isinstance(std_claim, list):
                roles_collected.extend(std_claim)
            else:
                roles_collected.append(std_claim)
        raw_roles = payload.get("roles") or payload.get("role")
        if raw_roles:
            if isinstance(raw_roles, list):
                roles_collected.extend(raw_roles)
            else:
                roles_collected.append(raw_roles)

        # Normalizar a lista de strings en mayúsculas
        roles = [str(r).upper() for r in roles_collected if r is not None]

        print(f"[DEBUG] Roles found (normalized): {roles}")

        if not roles or "ADMIN" not in roles:
            print(f"[ERROR] User is not ADMIN. Roles: {roles}")
            raise HTTPException(status_code=403, detail="Forbidden: User is not ADMIN")
        
        return payload
    except jwt.ExpiredSignatureError as e:
        print(f"[ERROR] Token expired: {e}")
        raise HTTPException(status_code=401, detail="Token expired")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Token validation failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
