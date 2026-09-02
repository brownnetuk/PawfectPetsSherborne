import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/message.dart';
import '../theme.dart';
import 'home_shell.dart';

/// Staff conversation list. Tapping a row opens the thread with that customer.
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  List<Conversation> _conversations = [];
  bool _loading = true;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    try {
      final rows = await context.read<Repository>().listConversations();
      if (!mounted) return;
      setState(() {
        _conversations = rows;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted || silent) return;
      setState(() {
        _loading = false;
        _error = e is ApiException ? e.message : 'Failed to load conversations';
      });
    }
  }

  Future<void> _open(Conversation c) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => MessageThreadScreen(customerId: c.customerId, customerName: c.name),
      ),
    );
    _load(silent: true); // refresh unread counts on return
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Messages'), actions: const [LogoutAction()]),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: _body(),
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return ListView(children: [const SizedBox(height: 120), Center(child: Text(_error!))]);
    }
    if (_conversations.isEmpty) {
      return ListView(children: [
        const SizedBox(height: 120),
        Center(child: Text('No conversations yet.', style: TextStyle(color: Colors.grey.shade600))),
      ]);
    }
    return ListView.separated(
      itemCount: _conversations.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, i) {
        final c = _conversations[i];
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: const Color(0xFFEAF5EE),
            child: Text(
              c.name.isNotEmpty ? c.name[0].toUpperCase() : '?',
              style: const TextStyle(color: brandGreenDark, fontWeight: FontWeight.bold),
            ),
          ),
          title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(
            '${c.lastSender == 'staff' ? 'You: ' : ''}${c.lastBody}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: c.unread > 0
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: brandGreen, borderRadius: BorderRadius.circular(999)),
                  child: Text('${c.unread}',
                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                )
              : Text(DateFormat('d MMM').format(c.lastAt),
                  style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
          onTap: () => _open(c),
        );
      },
    );
  }
}

/// One staff <-> customer thread with a composer.
class MessageThreadScreen extends StatefulWidget {
  final String customerId;
  final String customerName;
  const MessageThreadScreen({super.key, required this.customerId, required this.customerName});

  @override
  State<MessageThreadScreen> createState() => _MessageThreadScreenState();
}

class _MessageThreadScreenState extends State<MessageThreadScreen> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  List<Message> _messages = [];
  bool _loading = true;
  bool _sending = false;
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
      final msgs = await context.read<Repository>().messageThread(widget.customerId);
      if (!mounted) return;
      final wasAtBottom = !_scroll.hasClients ||
          _scroll.position.pixels >= _scroll.position.maxScrollExtent - 40;
      setState(() {
        _messages = msgs;
        _loading = false;
      });
      if (wasAtBottom) _jumpToBottom();
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _jumpToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await context.read<Repository>().sendMessage(widget.customerId, text);
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.customerName)),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? Center(child: Text('No messages yet.', style: TextStyle(color: Colors.grey.shade600)))
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(12),
                        itemCount: _messages.length,
                        itemBuilder: (context, i) => _Bubble(message: _messages[i]),
                      ),
          ),
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
                      decoration: const InputDecoration(hintText: 'Message…', isDense: true),
                      onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(onPressed: _sending ? null : _send, icon: const Icon(Icons.send)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final Message message;
  const _Bubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final fromStaff = message.fromStaff;
    return Align(
      alignment: fromStaff ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        margin: const EdgeInsets.only(bottom: 8),
        child: Column(
          crossAxisAlignment: fromStaff ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: fromStaff ? brandGreen : const Color(0xFFEEF1F4),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(message.body,
                  style: TextStyle(color: fromStaff ? Colors.white : Colors.black87)),
            ),
            const SizedBox(height: 2),
            Text(
              '${fromStaff ? (message.senderName ?? 'Staff') : 'Customer'} · ${DateFormat('d MMM HH:mm').format(message.createdAt)}',
              style: TextStyle(color: Colors.grey.shade500, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
