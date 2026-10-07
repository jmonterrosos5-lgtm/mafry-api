/// Configuración de la app.
/// La URL de la API se define al compilar (no queda escrita en el código):
///   flutter build apk --release --dart-define=API_URL=https://mafry-api.onrender.com
const String apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.0.2.2:3000', // emulador Android → localhost del PC (solo desarrollo)
);

/// En versión release solo se permite HTTPS (cifrado en tránsito).
bool get urlSegura => apiUrl.startsWith('https://');

/// Minutos sin uso tras los cuales se cierra la sesión.
const int minutosInactividad = 30;
