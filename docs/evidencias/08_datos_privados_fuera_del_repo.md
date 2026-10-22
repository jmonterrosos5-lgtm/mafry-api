# Datos reales de clientes fuera del repositorio · 2026-10-21 18:55

```
$ git check-ignore -v datos_privados/clientes.csv datos_privados/clientes_reales.sql .env
.gitignore:30:datos_privados/	datos_privados/clientes.csv
.gitignore:30:datos_privados/	datos_privados/clientes_reales.sql
.gitignore:5:.env	.env

$ git ls-files | grep -iE "datos_privados|clientes_reales|\.env$|\.dump$" | wc -l   # archivos sensibles versionados
0

$ git log --all --oneline -- datos_privados | wc -l   # commits que alguna vez incluyeron la carpeta
0
```

Resultado: la lista real de clientes existe solo en la PC del equipo; Git ignora esa carpeta y cualquier archivo .env, y ninguno se ha subido nunca a GitHub.
