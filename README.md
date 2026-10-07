# MAFRY · Sistema de vendedores de ruta

Solución de transformación digital para **Industria de Alimentos MAFRY**: automatiza el proceso comercial de los vendedores de ruta (visitas, pedidos y cobros) que antes se llevaba en papel y por WhatsApp.

| Componente | Tecnología | Carpeta |
|---|---|---|
| API REST | Node.js 20 + Express 5 | `src/` |
| Base de datos | PostgreSQL en Neon | `db/` |
| Panel administrativo | HTML + JS (servido por la API en `/admin`) | `public/admin/` |
| App de vendedores | Flutter (Android) | `mafry_movil/` |
| CI/CD | Jenkins + GitHub Actions → Render | `Jenkinsfile`, `.github/workflows/` |

## Ejecutar en local

```bash
npm ci
cp .env.example .env          # completar DATABASE_URL y JWT_SECRET
npm run migrate               # crea las tablas
npm run seed                  # datos demo (contraseñas desde .env o generadas al azar)
npm run dev                   # http://localhost:3000/admin
npm test                      # 48 pruebas funcionales y de seguridad
```

Con Docker: `docker compose up --build` (requiere `POSTGRES_PASSWORD` y `JWT_SECRET` en `.env`).

## Despliegue: Render (API + panel) y Neon (PostgreSQL)
1. **Neon** (neon.tech) → proyecto `mafry` → *Connect* → copiar la cadena de conexión (incluye `?sslmode=require`). Usar la conexión directa (sin `-pooler`) para las migraciones.
2. **Render** → New → **Blueprint** → este repositorio (usa `render.yaml`). Cuando lo pida, pegar en `DATABASE_URL` la cadena de Neon y escribir `SEED_ADMIN_PASSWORD` y `SEED_VENDEDOR_PASSWORD`. `JWT_SECRET` lo genera Render.
3. El primer arranque crea las tablas y los usuarios (`AUTO_MIGRATE=true`). Verificar `https://<servicio>.onrender.com/health` y luego `/admin`.
4. (Mínimo privilegio) En Neon → SQL Editor ejecutar `db/roles.sql` cambiando `:app_password` por una contraseña larga; luego cambiar `DATABASE_URL` en Render al usuario `mafry_app`.
5. Copiar el **Deploy Hook** de Render (Settings) a Jenkins (`render-deploy-hook`) y a GitHub (`RENDER_DEPLOY_HOOK`).

## Endpoints principales

| Método | Ruta | Rol |
|---|---|---|
| POST | `/api/auth/login` | público (limitado a 10 intentos / 15 min) |
| GET | `/api/auth/perfil` · POST `/api/auth/cambiar-contrasena` | autenticado |
| GET/POST | `/api/clientes` · GET `/api/clientes/:id` | vendedor (solo los suyos) / admin |
| PUT | `/api/clientes/:id` | admin |
| GET/POST/PUT | `/api/visitas` | vendedor (solo las suyas) |
| GET/POST | `/api/pedidos` · PUT `/api/pedidos/:id` (estado) | vendedor / admin |
| GET/POST | `/api/cobros` · PUT `/api/cobros/:id` (verificar/anular) | vendedor / admin |
| GET | `/api/productos` · POST/PUT | todos / admin |
| GET/POST/PUT | `/api/vendedores` | admin |
| GET | `/api/admin/dashboard` · `/api/admin/bitacora` | admin |
| GET | `/health` | público |

## Controles de seguridad
- Secretos solo en variables de entorno; `.gitignore` excluye `.env`, respaldos y llaves.
- Contraseñas con bcrypt (costo 12), política de 10+ caracteres, bloqueo tras 5 intentos.
- JWT HS256 con emisor y expiración de 8 h; usuario desactivado pierde acceso al instante.
- RBAC (admin / vendedor) y filtro por propietario en cada consulta (anti-IDOR).
- Validación de entradas con express-validator; consultas parametrizadas (anti-SQLi).
- Precios y totales calculados en el servidor; transacciones con bloqueo de filas.
- Helmet (CSP, HSTS, nosniff, frame-ancestors), CORS restringido, límite de 100 KB por solicitud.
- Errores genéricos al cliente con id de solicitud; detalle solo en logs.
- Bitácora de auditoría inmutable (trigger en PostgreSQL).
- Conexión a Neon con TLS y verificación de certificado; rol `mafry_app` con mínimo privilegio (`db/roles.sql`); respaldos con verificación SHA-256 (`scripts/backup.sh`).
- Pipeline: ESLint, `npm audit`, búsqueda de secretos, pruebas y despliegue solo si todo pasa.

## Equipo
Universidad Mariano Gálvez de Guatemala — Ingeniería en Sistemas · Seminario / Seguridad y Auditoría de Sistemas
Josselyn Samayoa (Product Owner) · David Sutuj (Scrum Master) · Valentín Rodríguez · Francisco Monterroso
