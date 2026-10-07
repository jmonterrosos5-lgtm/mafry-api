import 'dart:async';

import 'package:flutter/material.dart';

import 'api.dart';
import 'config.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';

const Color azulMafry = Color(0xFF1F3864);
const Color naranjaMafry = Color(0xFFE8700A);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MafryApp());
}

class MafryApp extends StatefulWidget {
  const MafryApp({super.key});

  @override
  State<MafryApp> createState() => _MafryAppState();
}

class _MafryAppState extends State<MafryApp> {
  final _navKey = GlobalKey<NavigatorState>();
  Timer? _inactividad;
  StreamSubscription<void>? _sub;

  @override
  void initState() {
    super.initState();
    // Si la sesión expira (401) o se cierra, volver al login.
    _sub = Api.instancia.sesionCerrada.stream.listen((_) {
      _navKey.currentState?.pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen(mensaje: 'Su sesión se cerró. Ingrese de nuevo.')),
        (_) => false,
      );
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _inactividad?.cancel();
    super.dispose();
  }

  /// Cierre de sesión automático por inactividad.
  void _reiniciarInactividad() {
    if (!Api.instancia.autenticado) return;
    _inactividad?.cancel();
    _inactividad = Timer(const Duration(minutes: minutosInactividad), () {
      if (Api.instancia.autenticado) Api.instancia.cerrarSesion();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => _reiniciarInactividad(),
      child: MaterialApp(
        navigatorKey: _navKey,
        title: 'MAFRY Vendedor',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: azulMafry, primary: azulMafry, secondary: naranjaMafry),
          useMaterial3: true,
          inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
        ),
        home: const ArranqueScreen(),
      ),
    );
  }
}

/// Pantalla inicial: intenta restaurar la sesión guardada de forma segura.
class ArranqueScreen extends StatefulWidget {
  const ArranqueScreen({super.key});

  @override
  State<ArranqueScreen> createState() => _ArranqueScreenState();
}

class _ArranqueScreenState extends State<ArranqueScreen> {
  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  Future<void> _iniciar() async {
    final ok = await Api.instancia.restaurarSesion();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => ok ? const HomeScreen() : const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: azulMafry,
      body: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('MAFRY', style: TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: 1)),
          SizedBox(height: 8),
          Text('VENDEDORES DE RUTA', style: TextStyle(color: Colors.white70, letterSpacing: 2)),
          SizedBox(height: 32),
          CircularProgressIndicator(color: naranjaMafry),
        ]),
      ),
    );
  }
}
