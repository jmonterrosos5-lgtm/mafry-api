import 'package:flutter/material.dart';

import '../api.dart';
import '../main.dart';

/// Detalle del pedido y registro de cobros contra el saldo pendiente.
class PedidoScreen extends StatefulWidget {
  const PedidoScreen({super.key, required this.idPedido});
  final int idPedido;

  @override
  State<PedidoScreen> createState() => _PedidoScreenState();
}

class _PedidoScreenState extends State<PedidoScreen> {
  Map<String, dynamic>? _p;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final p = await Api.instancia.get('/api/pedidos/${widget.idPedido}');
      setState(() => _p = p as Map<String, dynamic>);
    } on ApiException catch (e) {
      setState(() => _error = e.mensaje);
    }
  }

  double get _saldo => double.tryParse('${_p?['saldo']}') ?? 0;

  Future<void> _cobrar() async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FormCobro(idPedido: widget.idPedido, saldo: _saldo),
    );
    if (ok == true) _cargar();
  }

  Future<void> _anular() async {
    final si = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Anular pedido'),
        content: const Text('El pedido quedará anulado y el producto regresará al inventario.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('No')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Anular')),
        ],
      ),
    );
    if (si != true) return;
    try {
      await Api.instancia.put('/api/pedidos/${widget.idPedido}', {'estado': 'anulado'});
      _cargar();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.mensaje)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    return Scaffold(
      appBar: AppBar(backgroundColor: azulMafry, foregroundColor: Colors.white, title: Text('Pedido #${widget.idPedido}')),
      body: _error != null
          ? Center(child: Text(_error!))
          : p == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _cargar,
                  child: ListView(padding: const EdgeInsets.all(16), children: [
                    Text(p['nombre_negocio'] ?? '', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 4),
                    Wrap(spacing: 8, children: [
                      Chip(label: Text('${p['estado']}')),
                      if (p['metodo_pago'] != null) Chip(label: Text('${p['metodo_pago']}')),
                    ]),
                    const SizedBox(height: 8),
                    Card(
                      child: Column(children: [
                        for (final d in (p['detalles'] as List).cast<Map<String, dynamic>>())
                          ListTile(
                            dense: true,
                            title: Text(d['nombre_producto'] ?? ''),
                            subtitle: Text('${d['cantidad']} × ${q(d['precio_unitario'])}'),
                            trailing: Text(q(d['subtotal'])),
                          ),
                      ]),
                    ),
                    const SizedBox(height: 8),
                    ListTile(title: const Text('Total'), trailing: Text(q(p['total']), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                    ListTile(
                      title: const Text('Saldo pendiente'),
                      trailing: Text(q(p['saldo']), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: rojoMafry)),
                    ),
                    const SizedBox(height: 16),
                    if (_saldo > 0 && p['estado'] != 'anulado')
                      FilledButton.icon(
                        style: FilledButton.styleFrom(backgroundColor: rojoMafry, padding: const EdgeInsets.symmetric(vertical: 14)),
                        onPressed: _cobrar,
                        icon: const Icon(Icons.payments),
                        label: const Text('Registrar cobro'),
                      ),
                    if (p['estado'] == 'pendiente') ...[
                      const SizedBox(height: 12),
                      OutlinedButton(onPressed: _anular, child: const Text('Anular pedido')),
                    ],
                  ]),
                ),
    );
  }
}

class _FormCobro extends StatefulWidget {
  const _FormCobro({required this.idPedido, required this.saldo});
  final int idPedido;
  final double saldo;

  @override
  State<_FormCobro> createState() => _FormCobroState();
}

class _FormCobroState extends State<_FormCobro> {
  final _form = GlobalKey<FormState>();
  late final _monto = TextEditingController(text: widget.saldo.toStringAsFixed(2));
  final _ref = TextEditingController();
  String _metodo = 'efectivo';
  bool _enviando = false;

  @override
  void dispose() {
    _monto.dispose();
    _ref.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _enviando = true);
    try {
      await Api.instancia.post('/api/cobros', {
        'id_pedido': widget.idPedido,
        'monto': double.parse(_monto.text),
        'metodo': _metodo,
        if (_ref.text.trim().isNotEmpty) 'referencia': _ref.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.mensaje)));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Form(
        key: _form,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Registrar cobro', style: Theme.of(context).textTheme.titleLarge),
          Text('Saldo pendiente: ${q(widget.saldo)}'),
          const SizedBox(height: 16),
          TextFormField(
            controller: _monto,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Monto (Q)'),
            validator: (v) {
              final n = double.tryParse(v ?? '');
              if (n == null || n <= 0) return 'Ingrese un monto mayor que 0';
              if (n > widget.saldo + 0.001) return 'No puede exceder el saldo (${q(widget.saldo)})';
              return null;
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _metodo,
            decoration: const InputDecoration(labelText: 'Método'),
            items: const [
              DropdownMenuItem(value: 'efectivo', child: Text('Efectivo')),
              DropdownMenuItem(value: 'transferencia', child: Text('Transferencia')),
              DropdownMenuItem(value: 'cheque', child: Text('Cheque')),
            ],
            onChanged: (v) => setState(() => _metodo = v ?? 'efectivo'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _ref,
            maxLength: 60,
            decoration: const InputDecoration(labelText: 'No. de boleta / cheque'),
            validator: (v) => _metodo != 'efectivo' && (v == null || v.trim().isEmpty) ? 'Obligatorio para $_metodo' : null,
          ),
          FilledButton(onPressed: _enviando ? null : _guardar, child: Text(_enviando ? 'Guardando…' : 'Guardar cobro')),
        ]),
      ),
    );
  }
}
