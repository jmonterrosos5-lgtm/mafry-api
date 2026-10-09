#!/usr/bin/env bash
# Prepara la carpeta android/ de la app (Linux/macOS/CI).
set -euo pipefail
cd "$(dirname "$0")"
flutter create --platforms=android --org gt.mafry --project-name mafry_movil .
flutter pub get
M=android/app/src/main/AndroidManifest.xml
if ! grep -q 'android.permission.INTERNET' "$M"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.INTERNET"/>\n    <application android:usesCleartextTraffic="false"#' "$M"
  sed -i 's#android:label="mafry_movil"#android:label="MAFRY Vendedor"#' "$M"
fi
for g in android/app/build.gradle.kts android/app/build.gradle; do
  [ -f "$g" ] && sed -i -E 's/minSdk\s*=\s*flutter\.minSdkVersion/minSdk = 23/; s/minSdkVersion flutter\.minSdkVersion/minSdkVersion 23/' "$g"
done
# Ícono oficial de Mafry (espiral) en todas las densidades
cp -r branding/android/mipmap-* android/app/src/main/res/
echo "Listo."
