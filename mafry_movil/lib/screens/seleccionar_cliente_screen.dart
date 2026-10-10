import 'package:flutter/material.dart';

import '../api.dart';
import '../main.dart';
import 'cliente_screen.dart';

/// Botón "Nuevo pedido": el vendedor busca el cliente y la app inicia (o retoma)
/// la visita y abre el pedido. Solo aparecen los clientes asignados al vendedor.
class SeleccionarClienteScreen extends StatefulWidget {
  const SeleccionarClienteScreen({super.key});

  @override
  State<SeleccionarClienteScreen> createState() => _SeleccionarClienteScreenState();
}

class _SeleccionarClienteScreenState extends State<SeleccionarClienteScreen> {
  List<Map<String, dynamic>> _clientes = [];
  String _filtro = '';
  bool _cargando = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final datos = await Api.instancia.get('/api/clientes') as List;
      if (mounted) setState(() => _clientes = datos.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final f = _filtro.toLowerCase();
    final visibles = _clientes
        .where((c) => '${c['nombre_negocio'] ?? ''} ${c['direccion'] ?? ''}'.toLowerCase().contains(f))
        .toList();
    return Scaffold(
      appBar: AppBar(backgroundColor: azulMafry, foregroundColor: Colors.white, title: const Text('Nuevo pedido')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            autofocus: false,
            maxLength: 60,
            decoration: const InputDecoration(
              labelText: 'Buscar cliente',
              prefixIcon: Icon(Icons.search),
              counterText: '',
            ),
            onChanged: (v) => setState(() => _filtro = v.trim()),
          ),
        ),
        Expanded(
          child: _cargando
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
                  : visibles.isEmpty
                      ? const Center(child: Text('No hay clientes que coincidan'))
                      : ListView.separated(
                          itemCount: visibles.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final c = visibles[i];
                            return ListTile(
                              leading: const CircleAvatar(child: Icon(Icons.storefront)),
                              title: Text(c['nombre_negocio'] ?? ''),
                              subtitle: Text('${c['direccion'] ?? ''}'),
                              trailing: const Icon(Icons.add_shopping_cart, color: rojoMafry),
                              onTap: () => Navigator.of(context).pushReplacement(MaterialPageRoute(
                                builder: (_) => ClienteScreen(cliente: c, tomarPedido: true),
                              )),
                            );
                          },
                        ),
        ),
      ]),
    );
  }
}
