import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/portal_models.dart';
import '../theme.dart';

/// The customer's message thread with the business. Polls every few seconds
/// while open; push handles alerting when the app is backgrounded.
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  List<PortalMessage> _messages = [];
  bool _loading = true;
  bool _sending = false;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    try {
      final msgs = await context.read<Repository>().listMessages();
      if (!mounted) return;
      final wasAtBottom = !_scroll.hasClients ||
          _scroll.position.pixels >= _scroll.position.maxScrollExtent - 40;
      setState(() {
        _messages = msgs;
        _loading = false;
        _error = null;
      });
      if (wasAtBottom) _jumpToBottom();
    } catch (e) {
      if (!mounted || silent) return;
      setState(() {
        _loading = false;
        _error = e is ApiException ? e.message : 'Failed to load messages';
      });
    }
  }

  void _jumpToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await context.read<Repository>().sendMessage(text);
      _controller.clear();
      await _load(silent: true);
      _jumpToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Failed to send')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  // Customers may delete only their own messages (long-press).
  Future<void> _confirmDelete(PortalMessage m) async {
    if (m.fromStaff) return; // can't delete the business's messages
    final repo = context.read<Repository>();
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete message?'),
        content: const Text('This removes it for everyone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFC0392B)),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await repo.deleteMessage(m.id);
      await _load(silent: true);
    } catch (e) {
      messenger.showSnackBar(
          SnackBar(content: Text(e is ApiException ? e.message : 'Failed to delete')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(child: _body()),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    minLines: 1,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      hintText: 'Message…',
                      isDense: true,
                    ),
                    onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sending ? null : _send,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text(_error!, textAlign: TextAlign.center));
    }
    if (_messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'No messages yet. Send us a message and we\'ll reply here.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade600),
          ),
        ),
      );
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(12),
      itemCount: _messages.length,
      itemBuilder: (context, i) => _Bubble(
        message: _messages[i],
        onLongPress: () => _confirmDelete(_messages[i]),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final PortalMessage message;
  final VoidCallback? onLongPress;
  const _Bubble({required this.message, this.onLongPress});

  @override
  Widget build(BuildContext context) {
    final fromStaff = message.fromStaff;
    return Align(
      alignment: fromStaff ? Alignment.centerLeft : Alignment.centerRight,
      child: GestureDetector(
        onLongPress: fromStaff ? null : onLongPress,
        child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        margin: const EdgeInsets.only(bottom: 8),
        child: Column(
          crossAxisAlignment: fromStaff ? CrossAxisAlignment.start : CrossAxisAlignment.end,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: fromStaff ? const Color(0xFFEEF1F4) : brandGreen,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                message.body,
                style: TextStyle(color: fromStaff ? Colors.black87 : Colors.white),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${fromStaff ? (message.senderName ?? 'Pawfect Pets') : 'You'} · ${DateFormat('d MMM HH:mm').format(message.createdAt)}',
              style: TextStyle(color: Colors.grey.shade500, fontSize: 11),
            ),
          ],
          ),
        ),
      ),
    );
  }
}
