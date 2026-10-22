# Seguridad · MAFRY

Este sistema se rige por la **Política Integral de Seguridad de la Información de MAFRY**
(basada en ISO/IEC 27001:2022 y OWASP ASVS 4.0.3), documentada en el proyecto final de
Seguridad y Auditoría de Sistemas.

## Reportar una vulnerabilidad o incidente
- **No** abra un *issue* público con detalles explotables ni pegue contraseñas, tokens o cadenas de conexión.
- Avise de inmediato al responsable de DevSecOps del equipo (Francisco Monterroso) por el canal privado del equipo.
- Incluya: qué observó, cuándo, en qué componente (app, panel, API, Neon, Render, GitHub) y cómo reproducirlo.

## Si se filtra un secreto
1. Rotarlo primero (Neon → contraseña del rol; Render → `JWT_SECRET`; GitHub → secreto del workflow).
2. Verificar en la bitácora (`/admin` → Bitácora) accesos desde IPs o en horarios no habituales.
3. Registrar el incidente y la lección aprendida en el registro de cambios (Pull Request).

## Dónde vive cada secreto
| Secreto | Dónde se guarda | Nunca en |
|---|---|---|
| `DATABASE_URL` (rol `mafry_app`) | Render → Environment | código, capturas, chat |
| `JWT_SECRET`, `MFA_ENC_KEY` | Render → Environment (generado) | código, capturas, chat |
| `NEON_RESPALDO_URL` (rol `mafry_respaldo`), `RESPALDO_CLAVE` | GitHub → Settings → Secrets | código, logs |
| `RENDER_DEPLOY_HOOK` | GitHub Secrets y Jenkins Credentials | código, logs |
