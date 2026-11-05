# Estrategia de ramas y control de cambios — MAFRY (E9)

## Ramas y ambientes

| Rama | Ambiente | Despliegue | Base de datos |
|---|---|---|---|
| `feature/*`, `fix/*` | Trabajo individual | No | Local / CI |
| `dev` | Integración (DEV) | No se despliega: el pipeline compila y ejecuta todas las pruebas | PostgreSQL efímero del pipeline |
| `qa` | Pruebas (QA) | Render `mafry-api-qa` | Neon, rama `qa` |
| `main` | Producción (PROD) | Render `mafry-api` (https://mafry-api.onrender.com) | Neon, rama `production` |

## Política de promoción

```
feature/xxx ──PR──▶ dev ──PR──▶ qa ──PR──▶ main
```

1. **Nadie hace commit directo** a `dev`, `qa` ni `main`. Todo cambio entra por Pull Request.
2. **feature → dev**: requiere 1 revisión aprobada de **otro** integrante y el pipeline en verde.
   La revisión debe dejar comentarios sobre el código (no basta con "aprobar").
3. **dev → qa**: cuando un conjunto de cambios está completo. Requiere pipeline en verde y 1 aprobación.
   Al hacer merge, el pipeline despliega a QA y ejecuta una prueba de humo sobre `/health`.
4. **qa → main**: solo después de validar en QA (pruebas manuales y de carga). Requiere pipeline en verde
   y 1 aprobación. Al hacer merge se despliega a producción.
5. **Corrección urgente en producción (hotfix)**: rama `hotfix/xxx` desde `main` → PR a `main`
   → luego se baja a `qa` y `dev` para no perder el cambio.

## Bloqueo de merge si el pipeline falla

Configurado en GitHub → *Settings → Rules → Rulesets* para `dev`, `qa` y `main`:

- *Require a pull request before merging* — 1 aprobación, descartar aprobaciones si hay commits nuevos.
- *Require status checks to pass*: `1. Compilación`, `2. Pruebas unitarias (Jest + mocks)`,
  `2b. Pruebas de integración (supertest + PostgreSQL)`, `3. SonarCloud + quality gate`,
  `4. Pruebas de API (Postman + Newman)`.
- *Block force pushes* y *Restrict deletions*.

Si cualquier etapa falla (una prueba unitaria, el quality gate de Sonar o una aserción de Newman),
GitHub deshabilita el botón **Merge** del Pull Request.

## Guía para revisar un Pull Request

Una revisión efectiva responde, con comentarios en las líneas concretas:

- ¿El cambio hace lo que dice la descripción? ¿Hay casos límite sin cubrir?
- ¿Las pruebas nuevas verifican comportamiento (aserciones con valores esperados) o solo ejecutan código?
- ¿Se aislaron las dependencias correctas con dobles de prueba? ¿Está justificada cada una?
- ¿Se introducen secretos, consultas SQL sin parámetros o mensajes de error que filtren detalles?
- ¿El pipeline pasó? Si Sonar reporta problemas nuevos, ¿se corrigieron?
