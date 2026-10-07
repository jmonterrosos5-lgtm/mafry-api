import 'package:flutter/material.dart';

import '../api.dart';
import '../main.dart';

/// Alta de cliente nuevo desde la ruta (queda asignado al vendedor).
class NuevoClienteScreen extends StatefulWidget {
  const NuevoClienteScreen({super.key});

  @override
  State<NuevoClienteScreen> createState() => _NuevoClienteScreenState();
}

class _NuevoClienteScreenState extends State<NuevoClienteScreen> {
  final _form = GlobalKey<FormState>();
  final _negocio = TextEditingController();
  final _contacto = TextEditingController();
  final _telefono = TextEditingController();
  final _direccion = TextEditingController();
  String _tipo = 'tienda';
  bool _enviando = false;

  @override
  void dispose() {
    for (final c in [_negocio, _contacto, _telefono, _direccion]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _enviando = true);
    try {
      await Api.instancia.post('/api/clientes', {
        'nombre_negocio': _negocio.text.trim(),
        'tipo_cliente': _tipo,
        if (_contacto.text.trim().isNotEmpty) 'nombre_contacto': _contacto.text.trim(),
        if (_telefono.text.trim().isNotEmpty) 'telefono': _telefono.text.trim(),
        if (_direccion.text.trim().isNotEmpty) 'direccion': _direccion.text.trim(),
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
    return Scaffold(
      appBar: AppBar(backgroundColor: azulMafry, foregroundColor: Colors.white, title: const Text('Nuevo cliente')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          TextFormField(
            controller: _negocio,
            maxLength: 120,
            decoration: const InputDecoration(labelText: 'Nombre del negocio *'),
            validator: (v) => (v == null || v.trim().length < 2) ? 'Mínimo 2 caracteres' : null,
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: _tipo,
            decoration: const InputDecoration(labelText: 'Tipo'),
            items: const [
              DropdownMenuItem(value: 'tienda', child: Text('Tienda de barrio')),
              DropdownMenuItem(value: 'deposito', child: Text('Depósito')),
              DropdownMenuItem(value: 'super24', child: Text('Super 24')),
              DropdownMenuItem(value: 'supermercado', child: Text('Supermercado')),
              DropdownMenuItem(value: 'otro', child: Text('Otro')),
            ],
            onChanged: (v) => setState(() => _tipo = v ?? 'tienda'),
          ),
          const SizedBox(height: 16),
          TextFormField(controller: _contacto, maxLength: 120, decoration: const InputDecoration(labelText: 'Nombre del contacto')),
          const SizedBox(height: 8),
          TextFormField(
            controller: _telefono,
            maxLength: 20,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Teléfono'),
            validator: (v) => (v != null && v.isNotEmpty && !RegExp(r'^[0-9+\-\s]{8,20}$').hasMatch(v)) ? 'Teléfono inválido' : null,
          ),
          const SizedBox(height: 8),
          TextFormField(controller: _direccion, maxLength: 200, decoration: const InputDecoration(labelText: 'Dirección')),
          const SizedBox(height: 16),
          FilledButton(onPressed: _enviando ? null : _guardar, child: Text(_enviando ? 'Guardando…' : 'Guardar cliente')),
        ]),
      ),
    );
  }
}
