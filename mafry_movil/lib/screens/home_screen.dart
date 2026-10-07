import 'package:flutter/material.dart';

import '../api.dart';
import '../main.dart';
import 'cliente_screen.dart';
import 'nuevo_cliente_screen.dart';
import 'pedido_screen.dart';
import 'perfil_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  final _claves = [GlobalKey<_ListaState>(), GlobalKey<_ListaState>(), GlobalKey<_ListaState>()];

  @override
  Widget build(BuildContext context) {
    final u = Api.instancia.usuario ?? {};
    final paginas = [
      _Lista(
        key: _claves[0],
        ruta: '/api/clientes',
        vacio: 'No tiene clientes asignados',
        item: (c, recargar) => ListTile(
          leading: const CircleAvatar(child: Icon(Icons.storefront)),
          title: Text(c['nombre_negocio'] ?? ''),
          subtitle: Text([c['tipo_cliente'], c['direccion']].where((e) => e != null).join(' · ')),
          trailing: const Icon(Icons.chevron_right),
          onTap: () async {
            await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ClienteScreen(cliente: c)));
            recargar();
          },
        ),
      ),
      _Lista(
        key: _claves[1],
        ruta: '/api/pedidos',
        vacio: 'Aún no hay pedidos',
        item: (p, recargar) => ListTile(
          title: Text('#${p['id_pedido']} · ${p['nombre_negocio'] ?? ''}'),
          subtitle: Text('${_fecha(p['fecha_pedido'])} · ${p['estado']}'),
          trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(q(p['total']), style: const TextStyle(fontWeight: FontWeight.w600)),
            if ((double.tryParse('${p['saldo']}') ?? 0) > 0)
              Text('Saldo ${q(p['saldo'])}', style: const TextStyle(color: naranjaMafry, fontSize: 12)),
          ]),
          onTap: () async {
            await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PedidoScreen(idPedido: p['id_pedido'] as int)));
            recargar();
          },
        ),
      ),
      _Lista(
        key: _claves[2],
        ruta: '/api/cobros',
        vacio: 'Aún no hay cobros',
        item: (c, _) => ListTile(
          leading: Icon(c['estado'] == 'anulado' ? Icons.cancel : Icons.payments, color: c['estado'] == 'anulado' ? Colors.red : Colors.green),
          title: Text('${c['nombre_negocio'] ?? ''} · pedido #${c['id_pedido']}'),
          subtitle: Text('${_fecha(c['fecha_cobro'])} · ${c['metodo']} · ${c['estado']}'),
          trailing: Text(q(c['monto']), style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
      ),
      const PerfilScreen(),
    ];
    const titulos = ['Mis clientes', 'Mis pedidos', 'Mis cobros', 'Mi cuenta'];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: azulMafry,
        foregroundColor: Colors.white,
        title: Text(titulos[_tab]),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(child: Text('${u['codigo_vendedor'] ?? ''}', style: const TextStyle(color: Colors.white70))),
          ),
        ],
      ),
      body: IndexedStack(index: _tab, children: paginas),
      floatingActionButton: _tab == 0
          ? FloatingActionButton.extended(
              backgroundColor: naranjaMafry,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_business),
              label: const Text('Nuevo cliente'),
              onPressed: () async {
                final creado = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const NuevoClienteScreen()));
                if (creado == true) _claves[0].currentState?.cargar();
              },
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          if (i < 3) _claves[i].currentState?.cargar();
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.storefront), label: 'Clientes'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Pedidos'),
          NavigationDestination(icon: Icon(Icons.payments), label: 'Cobros'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Cuenta'),
        ],
      ),
    );
  }
}

String _fecha(dynamic f) {
  if (f == null) return '';
  final s = f.toString();
  final d = DateTime.tryParse(s.length == 10 ? '${s}T12:00:00' : s)?.toLocal();
  if (d == null) return s;
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${dos(d.day)}/${dos(d.month)}/${d.year}';
}

/// Lista genérica con "deslizar para actualizar" y manejo de errores.
class _Lista extends StatefulWidget {
  const _Lista({super.key, required this.ruta, required this.item, required this.vacio});
  final String ruta;
  final String vacio;
  final Widget Function(Map<String, dynamic> fila, VoidCallback recargar) item;

  @override
  State<_Lista> createState() => _ListaState();
}

class _ListaState extends State<_Lista> {
  List<Map<String, dynamic>> _filas = [];
  bool _cargando = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    cargar();
  }

  Future<void> cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final datos = await Api.instancia.get(widget.ruta) as List;
      if (!mounted) return;
      setState(() => _filas = datos.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando && _filas.isEmpty) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: cargar,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (_error != null)
            Padding(padding: const EdgeInsets.all(16), child: Text(_error!, style: const TextStyle(color: Colors.red))),
          if (_error == null && _filas.isEmpty)
            Padding(padding: const EdgeInsets.all(32), child: Text(widget.vacio, textAlign: TextAlign.center)),
          for (final f in _filas) ...[widget.item(f, cargar), const Divider(height: 1)],
          const SizedBox(height: 80),
        ],
      ),
    );
  }
}
