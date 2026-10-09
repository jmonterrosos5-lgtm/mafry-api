import 'package:flutter/material.dart';

import '../api.dart';
import '../main.dart';
import 'nuevo_pedido_screen.dart';

/// Detalle de cliente y flujo de visita: iniciar → tomar pedido → finalizar.
class ClienteScreen extends StatefulWidget {
  const ClienteScreen({super.key, required this.cliente});
  final Map<String, dynamic> cliente;

  @override
  State<ClienteScreen> createState() => _ClienteScreenState();
}

class _ClienteScreenState extends State<ClienteScreen> {
  int? _idVisita;
  int _pedidosEnVisita = 0;
  bool _ocupado = false;
  final _obs = TextEditingController();

  @override
  void dispose() {
    _obs.dispose();
    super.dispose();
  }

  String _horaActual() {
    final n = DateTime.now();
    return '${n.hour.toString().padLeft(2, '0')}:${n.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _accion(Future<void> Function() f) async {
    setState(() => _ocupado = true);
    try {
      await f();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.mensaje)));
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _iniciarVisita() => _accion(() async {
        final v = await Api.instancia.post('/api/visitas', {
          'id_cliente': widget.cliente['id_cliente'],
          'hora_inicio': _horaActual(),
          'estado': 'en_curso',
        });
        setState(() => _idVisita = v['id_visita'] as int);
      });

  Future<void> _finalizar(String estado) => _accion(() async {
        await Api.instancia.put('/api/visitas/$_idVisita', {
          'estado': estado,
          'hora_fin': _horaActual(),
          if (_obs.text.trim().isNotEmpty) 'observaciones': _obs.text.trim(),
        });
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(estado == 'completada' ? 'Visita finalizada' : 'Visita registrada como no atendida'),
        ));
        Navigator.of(context).pop();
      });

  @override
  Widget build(BuildContext context) {
    final c = widget.cliente;
    return Scaffold(
      appBar: AppBar(backgroundColor: azulMafry, foregroundColor: Colors.white, title: Text(c['nombre_negocio'] ?? 'Cliente')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Column(children: [
            ListTile(leading: const Icon(Icons.category), title: const Text('Tipo'), subtitle: Text('${c['tipo_cliente'] ?? '—'}')),
            ListTile(leading: const Icon(Icons.person), title: const Text('Contacto'), subtitle: Text('${c['nombre_contacto'] ?? '—'}')),
            ListTile(leading: const Icon(Icons.phone), title: const Text('Teléfono'), subtitle: Text('${c['telefono'] ?? '—'}')),
            ListTile(leading: const Icon(Icons.place), title: const Text('Dirección'), subtitle: Text('${c['direccion'] ?? '—'}')),
          ]),
        ),
        const SizedBox(height: 16),
        if (_idVisita == null)
          FilledButton.icon(
            onPressed: _ocupado ? null : _iniciarVisita,
            icon: const Icon(Icons.login),
            label: const Text('Iniciar visita'),
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
          )
        else ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: rojoMafry.withAlpha(26), borderRadius: BorderRadius.circular(8)),
            child: Text('Visita #$_idVisita en curso · pedidos registrados: $_pedidosEnVisita'),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: rojoMafry, padding: const EdgeInsets.symmetric(vertical: 14)),
            onPressed: _ocupado
                ? null
                : () async {
                    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
                      builder: (_) => NuevoPedidoScreen(idVisita: _idVisita!, cliente: c['nombre_negocio'] ?? ''),
                    ));
                    if (ok == true) setState(() => _pedidosEnVisita++);
                  },
            icon: const Icon(Icons.add_shopping_cart),
            label: const Text('Tomar pedido'),
          ),
          const SizedBox(height: 12),
          TextField(controller: _obs, maxLength: 500, maxLines: 2, decoration: const InputDecoration(labelText: 'Observaciones de la visita')),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _ocupado ? null : () => _finalizar('no_atendida'),
                child: const Text('No atendió'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: _ocupado ? null : () => _finalizar('completada'),
                child: const Text('Finalizar visita'),
              ),
            ),
          ]),
        ],
      ]),
    );
  }
}
