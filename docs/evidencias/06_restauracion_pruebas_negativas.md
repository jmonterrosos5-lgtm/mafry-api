# Pruebas negativas del procedimiento de respaldo/restauración · 2026-10-21 18:45

## N1. Restaurar sobre una base que ya tiene datos (debe cancelarse)
    ❌ La base destino no está vacía (11 tablas). Se cancela para no sobrescribir datos.
    → código de salida: 2

## N2. Archivo de respaldo alterado (debe rechazarse por SHA-256 antes de restaurar)
    alterado.dump: FAILED
    sha256sum: WARNING: 1 computed checksum did NOT match
    → código de salida: 1

## N3. El rol de respaldo no puede modificar la base de origen
    ERROR:  permission denied for table cobros
    ERROR:  must be owner of table clientes
