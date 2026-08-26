import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import '../api/api_client.dart';

/// Renders a PDF's pages to images and shows them in an [InteractiveViewer],
/// so the document can be pinch-zoomed and panned. Rasterised at a high DPI so
/// it stays sharp when zoomed in. [load] fetches the PDF bytes.
class ZoomablePdf extends StatefulWidget {
  final Future<Uint8List> Function() load;
  const ZoomablePdf({super.key, required this.load});

  @override
  State<ZoomablePdf> createState() => _ZoomablePdfState();
}

class _ZoomablePdfState extends State<ZoomablePdf> {
  late final Future<List<Uint8List>> _pages = _render();

  Future<List<Uint8List>> _render() async {
    final bytes = await widget.load();
    final pages = <Uint8List>[];
    await for (final page in Printing.raster(bytes, dpi: 300)) {
      pages.add(await page.toPng());
    }
    return pages;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Uint8List>>(
      future: _pages,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          final message = snapshot.error is ApiException
              ? (snapshot.error as ApiException).message
              : 'Failed to load PDF';
          return Center(child: Text(message, textAlign: TextAlign.center));
        }
        final pages = snapshot.data ?? [];
        if (pages.isEmpty) return const Center(child: Text('No pages to show'));
        return Container(
          color: Colors.grey.shade300,
          child: LayoutBuilder(
            builder: (context, constraints) => InteractiveViewer(
              constrained: false,
              minScale: 1,
              maxScale: 6,
              child: SizedBox(
                width: constraints.maxWidth,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final png in pages)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Image.memory(png, width: constraints.maxWidth, fit: BoxFit.fitWidth),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
