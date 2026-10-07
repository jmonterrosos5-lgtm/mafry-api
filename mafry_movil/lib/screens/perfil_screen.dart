import 'package:flutter/material.dart';

import '../api.dart';
import '../config.dart';

class PerfilScreen extends StatefulWidget {
  const PerfilScreen({super.key});

  @override
  State<PerfilScreen> createState() => _PerfilScreenState();
}

class _PerfilScreenState extends State<PerfilScreen> {
  final _form = GlobalKey<FormState>();
  final _actual = TextEditingController();
  final _nueva = TextEditingController();
  bool _enviando = false;

  @override
  void dispose() {
    _actual.dispose();
    _nueva.dispose();
    super.dispose();
  }

  Future<void> _cambiar() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _enviando = true);
    try {
      await Api.instancia.post('/api/auth/cambiar-contrasena', {'actual': _actual.text, 'nueva': _nueva.text});
      _actual.clear();
      _nueva.clear();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Contraseña actualizada')));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.mensaje)));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = Api.instancia.usuario ?? {};
    return ListView(padding: const EdgeInsets.all(16), children: [
      Card(
        child: ListTile(
          leading: const CircleAvatar(child: Icon(Icons.person)),
          title: Text('${u['nombre'] ?? ''} ${u['apellido'] ?? ''}'),
          subtitle: Text('${u['correo'] ?? ''}\n${u['codigo_vendedor'] ?? ''} · ${u['zona_asignada'] ?? ''}'),
          isThreeLine: true,
        ),
      ),
      const SizedBox(height: 16),
      Text('Cambiar contraseña', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 8),
      Form(
        key: _form,
        child: Column(children: [
          TextFormField(
            controller: _actual,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Contraseña actual'),
            validator: (v) => (v == null || v.isEmpty) ? 'Requerida' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _nueva,
            obscureText: true,
            maxLength: 72,
            decoration: const InputDecoration(labelText: 'Nueva contraseña', helperText: 'Mínimo 10 caracteres, con letras y números'),
            validator: (v) {
              if (v == null || v.length < 10) return 'Mínimo 10 caracteres';
              if (!RegExp(r'[A-Za-z]').hasMatch(v) || !RegExp(r'\d').hasMatch(v)) return 'Incluya letras y números';
              return null;
            },
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _enviando ? null : _cambiar, child: const Text('Actualizar contraseña')),
          ),
        ]),
      ),
      const SizedBox(height: 32),
      OutlinedButton.icon(
        onPressed: () => Api.instancia.cerrarSesion(),
        icon: const Icon(Icons.logout),
        label: const Text('Cerrar sesión'),
      ),
      const SizedBox(height: 16),
      Text('Servidor: ${Uri.parse(apiUrl).host}', textAlign: TextAlign.center, style: const TextStyle(color: Colors.black45, fontSize: 12)),
    ]);
  }
}
