import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

/// Error controlado de la API (mensaje apto para mostrar al usuario).
class ApiException implements Exception {
  ApiException(this.mensaje, [this.estado = 0]);
  final String mensaje;
  final int estado;
  @override
  String toString() => mensaje;
}

/// Cliente de la API MAFRY.
/// - El token JWT se guarda cifrado con flutter_secure_storage (Keystore de Android).
/// - En release se exige HTTPS.
/// - Si la API responde 401, se borra la sesión y se avisa a la app.
class Api {
  Api._();
  static final Api instancia = Api._();

  static const _almacen = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  String? _token;
  Map<String, dynamic>? usuario;

  /// Se dispara cuando la sesión expira o se cierra.
  final StreamController<void> sesionCerrada = StreamController.broadcast();

  bool get autenticado => _token != null;

  Future<bool> restaurarSesion() async {
    _token = await _almacen.read(key: 'token');
    final u = await _almacen.read(key: 'usuario');
    if (_token == null || u == null) return false;
    usuario = jsonDecode(u) as Map<String, dynamic>;
    try {
      await get('/api/auth/perfil'); // valida que el token siga vigente
      return true;
    } catch (_) {
      await cerrarSesion(notificar: false);
      return false;
    }
  }

  Future<void> login(String correo, String contrasena) async {
    final r = await _enviar('POST', '/api/auth/login',
        {'correo': correo.trim(), 'contrasena': contrasena}, conToken: false);
    final u = r['usuario'] as Map<String, dynamic>;
    if (u['rol'] != 'vendedor') {
      throw ApiException('Esta app es para vendedores. Use el panel web de administración.');
    }
    _token = r['token'] as String;
    usuario = u;
    await _almacen.write(key: 'token', value: _token);
    await _almacen.write(key: 'usuario', value: jsonEncode(u));
  }

  Future<void> cerrarSesion({bool notificar = true}) async {
    _token = null;
    usuario = null;
    await _almacen.deleteAll();
    if (notificar) sesionCerrada.add(null);
  }

  Future<dynamic> get(String ruta) => _enviar('GET', ruta, null);
  Future<dynamic> post(String ruta, Map<String, dynamic> cuerpo) => _enviar('POST', ruta, cuerpo);
  Future<dynamic> put(String ruta, Map<String, dynamic> cuerpo) => _enviar('PUT', ruta, cuerpo);

  Future<dynamic> _enviar(String metodo, String ruta, Map<String, dynamic>? cuerpo,
      {bool conToken = true}) async {
    if (kReleaseMode && !urlSegura) {
      throw ApiException('Configuración insegura: la API debe usar HTTPS.');
    }
    final uri = Uri.parse('$apiUrl$ruta');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (conToken && _token != null) 'Authorization': 'Bearer $_token',
    };
    http.Response res;
    try {
      final body = cuerpo == null ? null : jsonEncode(cuerpo);
      final Future<http.Response> peticion = switch (metodo) {
        'POST' => http.post(uri, headers: headers, body: body),
        'PUT' => http.put(uri, headers: headers, body: body),
        _ => http.get(uri, headers: headers),
      };
      // Render gratuito puede tardar en "despertar" tras un tiempo sin uso
      res = await peticion.timeout(const Duration(seconds: 45));
    } on SocketException {
      throw ApiException('Sin conexión a internet. Verifique su señal e intente de nuevo.');
    } on TimeoutException {
      throw ApiException('El servidor tardó demasiado en responder. Intente de nuevo.');
    }

    dynamic datos;
    try {
      datos = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      datos = null;
    }

    if (res.statusCode == 401 && conToken) {
      await cerrarSesion();
      throw ApiException('Su sesión expiró. Ingrese de nuevo.', 401);
    }
    if (res.statusCode >= 400) {
      var msg = (datos is Map && datos['error'] != null) ? datos['error'].toString() : 'Error ${res.statusCode}';
      if (datos is Map && datos['campos'] is List) {
        msg += ': ${(datos['campos'] as List).map((c) => c['mensaje']).join(', ')}';
      }
      throw ApiException(msg, res.statusCode);
    }
    return datos;
  }
}

/// Formato de moneda en quetzales.
String q(dynamic v) {
  final n = double.tryParse(v?.toString() ?? '') ?? 0;
  final partes = n.toStringAsFixed(2).split('.');
  final entero = partes[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return 'Q$entero.${partes[1]}';
}
