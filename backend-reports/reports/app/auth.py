"""
@summary Utilidades de autenticación/autorización para el microservicio de reportes.
@remarks
- Extrae y valida el token Bearer (JWT) de las solicitudes.\
- Verifica que el rol incluya `ADMIN` antes de permitir el acceso a rutas protegidas.\
- Usa las variables `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` (verificándose de forma laxa por compatibilidad).
"""
import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

security = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ISSUER = os.getenv("JWT_ISSUER", "MarcadorApi")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "MarcadorUi")


def require_admin(creds: HTTPAuthorizationCredentials = Depends(security)):
    """
    @summary Dependencia de FastAPI que exige rol ADMIN.
    @remarks
    - Decodifica el JWT con `JWT_SECRET`.\
    - Acepta el rol desde `role`, `roles` o el claim estándar de .NET.\
    - Lanza 401/403 ante token inválido, expirado o sin rol suficiente.
    @param creds Credenciales extraídas del esquema HTTP Bearer.
    @returns El payload del JWT si es válido y posee ADMIN.
    """
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
