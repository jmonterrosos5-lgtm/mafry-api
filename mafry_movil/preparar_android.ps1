# Prepara la carpeta android/ de la app (Windows PowerShell).
# Uso:  cd mafry_movil ; .\preparar_android.ps1
# Requiere Flutter SDK instalado (flutter doctor sin errores en Android toolchain).
$ErrorActionPreference = 'Stop'
flutter create --platforms=android --org gt.mafry --project-name mafry_movil .
flutter pub get

$manifest = 'android/app/src/main/AndroidManifest.xml'
$xml = Get-Content $manifest -Raw
if ($xml -notmatch 'android.permission.INTERNET') {
  # Permiso de Internet y bloqueo explícito de tráfico sin cifrar (solo HTTPS)
  $xml = $xml -replace '<application', "<uses-permission android:name=`"android.permission.INTERNET`"/>`n    <application android:usesCleartextTraffic=`"false`""
  $xml = $xml -replace 'android:label="mafry_movil"', 'android:label="MAFRY Vendedor"'
  Set-Content $manifest $xml -Encoding UTF8
}

# flutter_secure_storage requiere minSdk 23 o superior
foreach ($g in @('android/app/build.gradle.kts', 'android/app/build.gradle')) {
  if (Test-Path $g) {
    (Get-Content $g -Raw) -replace 'minSdk\s*=\s*flutter\.minSdkVersion', 'minSdk = 23' -replace 'minSdkVersion flutter\.minSdkVersion', 'minSdkVersion 23' | Set-Content $g -Encoding UTF8
  }
}
# Ícono oficial de Mafry (espiral) en todas las densidades
Copy-Item -Path 'branding/android/mipmap-*' -Destination 'android/app/src/main/res/' -Recurse -Force
Write-Host 'Listo. Para probar en el emulador:  flutter run'
Write-Host 'Para generar el APK de producción:  flutter build apk --release --dart-define=API_URL=https://<su-servicio>.onrender.com'
