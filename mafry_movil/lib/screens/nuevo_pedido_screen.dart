import 'package:flutter/material.dart';

import '../api.dart';
import '../main.dart';

/// Toma de pedido. Los precios mostrados son informativos:
/// el servidor recalcula el total con el precio oficial del catálogo.
class NuevoPedidoScreen extends StatefulWidget {
  const NuevoPedidoScreen({super.key, required this.idVisita, required this.cliente});
  final int idVisita;
  final String cliente;

  @override
  State<NuevoPedidoScreen> createState() => _NuevoPedidoScreenState();
}

class _NuevoPedidoScreenState extends State<NuevoPedidoScreen> {
  List<Map<String, dynamic>> _productos = [];
  final Map<int, int> _cantidades = {};
  String _metodo = 'efectivo';
  final _obs = TextEditingController();
  bool _cargando = true;
  bool _enviando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  @override
  void dispose() {
    _obs.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    try {
      final p = await Api.instancia.get('/api/productos') as List;
      setState(() => _productos = p.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  double get _total => _cantidades.entries.fold<double>(0, (s, e) {
        final p = _productos.firstWhere((x) => x['id_producto'] == e.key);
        return s + e.value * (double.tryParse('${p['precio_unitario']}') ?? 0);
      });

  void _cambiar(Map<String, dynamic> p, int delta) {
    final id = p['id_producto'] as int;
    final stock = p['stock_disponible'] as int;
    final nueva = ((_cantidades[id] ?? 0) + delta).clamp(0, stock).toInt();
    setState(() {
      if (nueva == 0) {
        _cantidades.remove(id);
      } else {
        _cantidades[id] = nueva;
      }
    });
  }

  Future<void> _enviar() async {
    if (_cantidades.isEmpty) return;
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Confirmar pedido'),
        content: Text('${widget.cliente}\n${_cantidades.length} producto(s) · total aprox. ${q(_total)}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Revisar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirmar')),
        ],
      ),
    );
    if (confirmar != true) return;
    setState(() => _enviando = true);
    try {
      final r = await Api.instancia.post('/api/pedidos', {
        'id_visita': widget.idVisita,
        'metodo_pago': _metodo,
        if (_obs.text.trim().isNotEmpty) 'observaciones': _obs.text.trim(),
        'items': [
          for (final e in _cantidades.entries) {'id_producto': e.key, 'cantidad': e.value},
        ],
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Pedido #${r['id_pedido']} registrado por ${q(r['total'])}')));
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.mensaje)));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(backgroundColor: azulMafry, foregroundColor: Colors.white, title: Text('Pedido · ${widget.cliente}')),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(children: [
                  for (final p in _productos)
                    ListTile(
                      title: Text(p['nombre'] ?? ''),
                      subtitle: Text('${q(p['precio_unitario'])} / ${p['unidad_medida']} · stock ${p['stock_disponible']}'),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(icon: const Icon(Icons.remove_circle_outline), onPressed: () => _cambiar(p, -1)),
                        SizedBox(
                          width: 28,
                          child: Text('${_cantidades[p['id_producto']] ?? 0}', textAlign: TextAlign.center,
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                        ),
                        IconButton(icon: const Icon(Icons.add_circle, color: naranjaMafry), onPressed: () => _cambiar(p, 1)),
                      ]),
                    ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(children: [
                      DropdownButtonFormField<String>(
                        value: _metodo,
                        decoration: const InputDecoration(labelText: 'Forma de pago'),
                        items: const [
                          DropdownMenuItem(value: 'efectivo', child: Text('Efectivo')),
                          DropdownMenuItem(value: 'credito', child: Text('Crédito')),
                          DropdownMenuItem(value: 'transferencia', child: Text('Transferencia')),
                        ],
                        onChanged: (v) => setState(() => _metodo = v ?? 'efectivo'),
                      ),
                      const SizedBox(height: 12),
                      TextField(controller: _obs, maxLength: 500, decoration: const InputDecoration(labelText: 'Observaciones')),
                    ]),
                  ),
                  const SizedBox(height: 90),
                ]),
      bottomSheet: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        color: Colors.white,
        child: Row(children: [
          Expanded(child: Text('Total aprox. ${q(_total)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: naranjaMafry),
            onPressed: _cantidades.isEmpty || _enviando ? null : _enviar,
            child: Text(_enviando ? 'Enviando…' : 'Registrar pedido'),
          ),
        ]),
      ),
    );
  }
}
