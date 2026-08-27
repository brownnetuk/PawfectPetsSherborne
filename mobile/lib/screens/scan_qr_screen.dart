import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../state/auth_provider.dart';

/// First-launch provisioning: scan the QR code shown in the admin app (which
/// encodes the backend URL) so the app knows which server to talk to. Only
/// shown until the app has been provisioned.
class ScanQrScreen extends StatefulWidget {
  const ScanQrScreen({super.key});

  @override
  State<ScanQrScreen> createState() => _ScanQrScreenState();
}

class _ScanQrScreenState extends State<ScanQrScreen> {
  final _controller = MobileScannerController();
  bool _handled = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool _isValidUrl(String value) {
    final uri = Uri.tryParse(value);
    return uri != null && (uri.isScheme('http') || uri.isScheme('https')) && uri.host.isNotEmpty;
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_handled) return;
    final value = (capture.barcodes.isNotEmpty ? capture.barcodes.first.rawValue : null)?.trim() ?? '';
    if (!_isValidUrl(value)) {
      setState(() => _error = 'That QR code isn’t a valid server URL. Scan the one in the admin app.');
      return;
    }
    _handled = true;
    await _controller.stop();
    if (mounted) await context.read<AuthProvider>().provision(value);
  }

  /// Fallback for devices without a working camera (and the simulator): type
  /// the server URL from the admin app instead of scanning it.
  Future<void> _enterManually() async {
    final controller = TextEditingController();
    final url = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Enter server URL'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: const InputDecoration(hintText: 'https://api.example.com'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Connect'),
          ),
        ],
      ),
    );
    if (url == null) return;
    if (!_isValidUrl(url)) {
      setState(() => _error = 'That isn’t a valid URL.');
      return;
    }
    _handled = true;
    await _controller.stop();
    if (mounted) await context.read<AuthProvider>().provision(url);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan QR code')),
      body: Column(
        children: [
          Expanded(
            child: Stack(
              alignment: Alignment.center,
              children: [
                MobileScanner(controller: _controller, onDetect: _onDetect),
                // Simple viewfinder overlay.
                Container(
                  width: 240,
                  height: 240,
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.white, width: 3),
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                Text(
                  'Point your camera at the QR code shown in the admin app to connect this device.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey.shade700),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: Colors.red.shade700)),
                ],
                const SizedBox(height: 8),
                TextButton(onPressed: _enterManually, child: const Text('Enter URL manually')),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
