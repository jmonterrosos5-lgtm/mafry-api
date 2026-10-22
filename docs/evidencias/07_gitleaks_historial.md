# Escaneo de secretos en el historial de Git · Gitleaks 8.21.2

Fecha: 2026-10-21 18:49 (hora de Guatemala). Repositorio: jmonterrosos5-lgtm/mafry-api. Valores ocultos con --redact=100.

## 1. Reglas por defecto (antes de la mejora)

```
12:50AM INF 18 commits scanned.
12:50AM INF scan completed in 78.8ms
12:50AM WRN leaks found: 4
3eb862e 2026-10-07 scripts/demo_seguridad.sh línea 27 jwt
3eb862e 2026-10-07 tests/env.js línea 7 generic-api-key
5573e94 2026-09-17 .env.example línea 7 generic-api-key
5573e94 2026-09-17 docker-compose.yml línea 13 generic-api-key
```

Las reglas por defecto NO detectan la contraseña escrita en src/config/db.js (5573e94 y dbd2621) y sí marcan dos falsos positivos (token falso de la demo y contraseñas de la base de pruebas).

## 2. Con la configuración del proyecto (.gitleaks.toml + .gitleaksignore)

```
12:49AM INF scan completed in 2.26s
12:49AM WRN leaks found: 4
dbd2621 2026-09-24 src/config/db.js línea 8 mafry-credencial-en-codigo
5573e94 2026-09-17 .env.example línea 7 generic-api-key
5573e94 2026-09-17 docker-compose.yml línea 13 generic-api-key
5573e94 2026-09-17 src/config/db.js línea 8 mafry-credencial-en-codigo
```

Resultado: se detectan los 4 puntos reales del incidente de credenciales publicadas (commits del 17 y 24 de septiembre de 2026, anteriores a la v2). Esos valores ya fueron rotados en Neon y Render; quedan en el historial público (riesgo residual aceptado, ver R-01).

## 3. Carpeta de trabajo actual (lo que se sube desde ahora)

```
12:49AM INF scan completed in 909ms
12:49AM INF no leaks found
```
