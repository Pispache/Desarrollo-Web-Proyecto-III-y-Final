# Documentación de Seguridad - OWASP Top 10 2021

Este documento detalla la implementación de las medidas de seguridad basadas en OWASP Top 10 2021 para el Marcador de Baloncesto.

## Resumen
La seguridad del sistema se ha implementado siguiendo las mejores prácticas de OWASP, enfocándonos en proteger tanto el frontend (Angular) como el backend (.NET y Node.js) y las bases de datos (SQL Server, MongoDB y PostgreSQL).

## OWASP Top 10 2021 - Análisis e Implementación

| Código                                                    | Vulnerabilidad                                                                                                                                          | Implementación |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **A01:2021 – Broken Access Control**                      | Fallos en los controles de acceso permiten a usuarios no autorizados ver o modificar información, o acceder a funciones restringidas.                   | - Implementación de JWT para autenticación<br>- Guards en Angular para proteger rutas<br>- Middleware de autorización en API<br>- Validación de roles (Admin/Viewer) |
| **A02:2021 – Cryptographic Failures**                     | Manejo incorrecto de criptografía (datos sin cifrar, algoritmos débiles, claves expuestas), resultando en pérdida o filtración de información sensible. | - Uso de HTTPS para todas las comunicaciones<br>- Almacenamiento seguro de contraseñas con bcrypt<br>- Variables de entorno para secretos<br>- Cifrado de datos sensibles en base de datos |
| **A03:2021 – Injection**                                  | Entrada de datos maliciosos en consultas (SQL, NoSQL, comando OS, LDAP) que permiten ejecución de comandos o acceso no autorizado.                      | - Uso de ORM con parámetros preparados<br>- Validación y sanitización de entrada de datos<br>- Escape de caracteres especiales<br>- Prevención de NoSQL injection en MongoDB |
| **A04:2021 – Insecure Design**                            | Falta de controles de seguridad desde la fase de arquitectura y diseño, generando sistemas vulnerables por naturaleza.                                  | - Implementación de principio de mínimo privilegio<br>- Separación de responsabilidades<br>- Validación en múltiples capas<br>- Diseño con seguridad por defecto |
| **A05:2021 – Security Misconfiguration**                  | Configuraciones inseguras en servidores, APIs, contenedores, frameworks, permisos o falta de hardening.                                                 | - Configuraciones seguras por defecto<br>- Eliminación de headers innecesarios<br>- Configuración apropiada de CORS<br>- Hardening de contenedores Docker |
| **A06:2021 – Vulnerable and Outdated Components**         | Uso de librerías, frameworks o sistemas con vulnerabilidades conocidas sin actualizar ni aplicar parches.                                               | - Actualizaciones regulares de dependencias<br>- Escaneo de vulnerabilidades con npm audit<br>- Monitoreo de CVEs<br>- Proceso de actualización documentado |
| **A07:2021 – Identification and Authentication Failures** | Errores en autenticación y manejo de sesiones (contraseñas débiles, sesiones inseguras, multifactor ausente).                                           | - Implementación de OAuth 2.0<br>- Políticas de contraseñas seguras<br>- Manejo seguro de sesiones<br>- Integración con proveedores de identidad |
| **A08:2021 – Software and Data Integrity Failures**       | Falta de validación de integridad en software y datos, permitiendo manipulación o instalación de componentes no confiables.                             | - Verificación de integridad en CI/CD<br>- Firmas digitales para artefactos<br>- Control de versiones para configuraciones<br>- Validación de datos entre sistemas |
| **A09:2021 – Security Logging and Monitoring Failures**   | Falta de registro, monitoreo y alerta efectiva ante actividades maliciosas; dificulta detectar ataques y responder.                                     | - Implementación de logging centralizado<br>- Monitoreo de eventos de seguridad<br>- Alertas automatizadas<br>- Auditoría de acciones críticas |
| **A10:2021 – Server-Side Request Forgery (SSRF)**         | Aplicación engañada para realizar solicitudes a recursos internos, permitiendo acceso a servicios privados o metadatos de instancias cloud.             | - Validación estricta de URLs<br>- Lista blanca de dominios permitidos<br>- Restricción de acceso a metadatos<br>- Configuración de firewalls internos |

## Implementación por Componentes

### Frontend (Angular)
- Implementación de interceptores HTTP para tokens
- Guards de autenticación y autorización
- Sanitización de datos
- Validación de formularios
- Manejo seguro de estado

### Backend (API)
- Middleware de autenticación JWT
- Validación de roles y permisos
- Rate limiting
- Sanitización de entrada
- Logging de seguridad

### Base de Datos
- Encriptación en reposo
- Backups seguros
- Control de acceso granular
- Auditoría de cambios

## Monitoreo y Mantenimiento

- Escaneos regulares de seguridad
- Actualizaciones periódicas
- Revisión de logs
- Plan de respuesta a incidentes