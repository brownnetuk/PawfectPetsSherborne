import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../api/api_client.dart';
import '../../api/repository.dart';
import '../../models/portal_models.dart';
import '../../theme.dart';
import 'animal_form_screen.dart';

class AnimalsScreen extends StatefulWidget {
  const AnimalsScreen({super.key});

  @override
  State<AnimalsScreen> createState() => _AnimalsScreenState();
}

class _AnimalsScreenState extends State<AnimalsScreen> {
  late Future<List<Animal>> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<Repository>().listAnimals();
  }

  void _reload() => setState(() => _future = context.read<Repository>().listAnimals());

  Future<void> _openForm({Animal? animal}) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => AnimalFormScreen(animal: animal)),
    );
    if (saved == true) _reload();
  }

  IconData _iconFor(String species) {
    switch (species) {
      case 'cat':
        return Icons.pets; // no dedicated cat glyph; pets reads fine
      case 'dog':
        return Icons.pets;
      default:
        return Icons.cruelty_free;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Animals')),
      body: FutureBuilder<List<Animal>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(
              child: Text(snap.error is ApiException ? (snap.error as ApiException).message : 'Failed to load pets'),
            );
          }
          final animals = snap.data ?? [];
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (animals.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 40),
                  child: Center(child: Text('No pets yet.', style: TextStyle(color: Colors.grey.shade600))),
                ),
              ...animals.map((a) => _AnimalBubble(animal: a, icon: _iconFor(a.species), onTap: () => _openForm(animal: a))),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => _openForm(),
                icon: const Icon(Icons.add),
                label: const Text('Add a pet'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _AnimalBubble extends StatelessWidget {
  final Animal animal;
  final IconData icon;
  final VoidCallback onTap;
  const _AnimalBubble({required this.animal, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final a = animal;
    final species = a.species.isEmpty ? '' : a.species[0].toUpperCase() + a.species.substring(1);
    final subtitle = [a.breed, species].where((s) => s.isNotEmpty).join(' · ');
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: const Color(0xFFEAF5EE),
                child: Icon(icon, color: brandGreenDark),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(a.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: TextStyle(color: Colors.grey.shade700, fontSize: 13)),
                    const SizedBox(height: 2),
                    Text('Age ${a.age}${a.sex.isNotEmpty ? ' · ${a.sex}' : ''}',
                        style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }
}
