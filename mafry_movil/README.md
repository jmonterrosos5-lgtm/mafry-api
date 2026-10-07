# MAFRY Vendedor (Flutter)

App móvil para los vendedores de ruta: clientes, visitas, pedidos y cobros.

## Opción A — Compilar en GitHub (recomendado, no requiere Flutter local)
1. En GitHub: **Settings → Secrets and variables → Actions → Variables** → crear `MAFRY_API_URL` con la URL de Render (ej. `https://mafry-api.onrender.com`).
2. **Actions → APK MAFRY Vendedor → Run workflow**.
3. Al terminar, descargar el artefacto `mafry-vendedor-apk` e instalar `app-release.apk` en el teléfono.

## Opción B — Compilar en la PC
```powershell
cd mafry_movil
.\preparar_android.ps1
flutter run                                   # emulador, API local en http://10.0.2.2:3000
flutter build apk --release --dart-define=API_URL=https://mafry-api.onrender.com
```
El APK queda en `build/app/outputs/flutter-apk/app-release.apk`.

## Seguridad
- Token JWT guardado cifrado (`flutter_secure_storage` → Android Keystore), nunca en texto plano.
- En release solo se permite HTTPS; `usesCleartextTraffic="false"`.
- Cierre de sesión automático tras 30 minutos sin uso o al expirar el token (401).
- La URL de la API se inyecta al compilar (`--dart-define`), no queda en el código.
- Precios mostrados son informativos: el servidor recalcula el total con el catálogo.
