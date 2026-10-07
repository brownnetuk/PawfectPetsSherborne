import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/customer.dart';

/// Staff edit of a customer's record -- mirrors the admin's Edit Customer
/// modal: client details, emergency contact, emergency vet, and security.
/// Sends the same PATCH payload shape (empty optionals omitted; a blank alarm
/// instructions field is left out entirely so the stored encrypted value is
/// kept). Pops `true` once saved.
class EditCustomerScreen extends StatefulWidget {
  final Customer customer;
  const EditCustomerScreen({super.key, required this.customer});

  @override
  State<EditCustomerScreen> createState() => _EditCustomerScreenState();
}

class _EditCustomerScreenState extends State<EditCustomerScreen> {
  late final Map<String, dynamic> _raw = widget.customer.raw;
  Map<String, dynamic> get _ec => (_raw['emergencyContact'] as Map<String, dynamic>?) ?? const {};
  Map<String, dynamic> get _vet => (_raw['emergencyVet'] as Map<String, dynamic>?) ?? const {};

  String _s(dynamic v) => v is String ? v : '';

  // Client details.
  late final _firstName = TextEditingController(text: _s(_raw['firstName']));
  late final _surname = TextEditingController(text: _s(_raw['surname']));
  late final _email = TextEditingController(text: _s(_raw['email']));
  late final _address1 = TextEditingController(text: _s(_raw['address1']));
  late final _address2 = TextEditingController(text: _s(_raw['address2']));
  late final _town = TextEditingController(text: _s(_raw['town']));
  late final _county = TextEditingController(text: _s(_raw['county']));
  late final _postcode = TextEditingController(text: _s(_raw['postcode']));
  late final _phone = TextEditingController(text: _s(_raw['phoneNumber']));

  // Emergency contact.
  late bool _sameAsClient = _ec['sameAsClient'] as bool? ?? false;
  late final _ecFirstName = TextEditingController(text: _s(_ec['firstName']));
  late final _ecSurname = TextEditingController(text: _s(_ec['surname']));
  late final _ecAddress1 = TextEditingController(text: _s(_ec['address1']));
  late final _ecAddress2 = TextEditingController(text: _s(_ec['address2']));
  late final _ecTown = TextEditingController(text: _s(_ec['town']));
  late final _ecCounty = TextEditingController(text: _s(_ec['county']));
  late final _ecPostcode = TextEditingController(text: _s(_ec['postcode']));
  late final _ecPhone = TextEditingController(text: _s(_ec['phoneNumber']));
  late final _ecEmail = TextEditingController(text: _s(_ec['email']));

  // Emergency vet.
  late final _vetPractice = TextEditingController(text: _s(_vet['practiceName']));
  late final _vetAddress1 = TextEditingController(text: _s(_vet['address1']));
  late final _vetAddress2 = TextEditingController(text: _s(_vet['address2']));
  late final _vetTown = TextEditingController(text: _s(_vet['town']));
  late final _vetCounty = TextEditingController(text: _s(_vet['county']));
  late final _vetPostcode = TextEditingController(text: _s(_vet['postcode']));
  late final _vetTelephone = TextEditingController(text: _s(_vet['telephone']));
  late final _vetEmail = TextEditingController(text: _s(_vet['email']));

  // Security.
  late bool _keysProvided =
      ((_raw['security'] as Map<String, dynamic>?)?['keysProvided'] as bool?) ?? false;
  final _alarmInstructions = TextEditingController();
  late final _furtherInformation = TextEditingController(
      text: _s((_raw['security'] as Map<String, dynamic>?)?['furtherInformation']));

  bool _submitting = false;

  @override
  void dispose() {
    for (final c in [
      _firstName, _surname, _email, _address1, _address2, _town, _county, _postcode, _phone,
      _ecFirstName, _ecSurname, _ecAddress1, _ecAddress2, _ecTown, _ecCounty, _ecPostcode,
      _ecPhone, _ecEmail,
      _vetPractice, _vetAddress1, _vetAddress2, _vetTown, _vetCounty, _vetPostcode,
      _vetTelephone, _vetEmail,
      _alarmInstructions, _furtherInformation,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _validate() {
    if (_firstName.text.trim().isEmpty ||
        _address1.text.trim().isEmpty ||
        _town.text.trim().isEmpty ||
        _postcode.text.trim().isEmpty ||
        _phone.text.trim().isEmpty ||
        _email.text.trim().isEmpty) {
      return 'First name, address, town, postcode, phone and email are required.';
    }
    // Same rule as the admin modal.
    if (!_sameAsClient &&
        (_ecFirstName.text.trim().isEmpty ||
            _ecAddress1.text.trim().isEmpty ||
            _ecTown.text.trim().isEmpty ||
            _ecPostcode.text.trim().isEmpty)) {
      return 'Emergency contact name and address are required unless "same as client".';
    }
    if (!_sameAsClient && _ecPhone.text.trim().isEmpty) {
      return 'Emergency contact phone number is required unless "same as client".';
    }
    return null;
  }

  Future<void> _submit() async {
    final error = _validate();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    String t(TextEditingController c) => c.text.trim();
    setState(() => _submitting = true);
    try {
      // Mirrors the admin modal's payload: empty optionals omitted; emergency
      // contact detail fields dropped when "same as client"; blank alarm
      // instructions left out so the stored encrypted value is untouched.
      await context.read<Repository>().updateCustomer(widget.customer.id, {
        'firstName': t(_firstName),
        if (t(_surname).isNotEmpty) 'surname': t(_surname),
        'email': t(_email),
        'address1': t(_address1),
        if (t(_address2).isNotEmpty) 'address2': t(_address2),
        'town': t(_town),
        if (t(_county).isNotEmpty) 'county': t(_county),
        'postcode': t(_postcode),
        'phoneNumber': t(_phone),
        'emergencyContact': {
          'sameAsClient': _sameAsClient,
          if (!_sameAsClient) ...{
            'firstName': t(_ecFirstName),
            if (t(_ecSurname).isNotEmpty) 'surname': t(_ecSurname),
            'address1': t(_ecAddress1),
            if (t(_ecAddress2).isNotEmpty) 'address2': t(_ecAddress2),
            'town': t(_ecTown),
            if (t(_ecCounty).isNotEmpty) 'county': t(_ecCounty),
            'postcode': t(_ecPostcode),
            'phoneNumber': t(_ecPhone),
          },
          if (t(_ecEmail).isNotEmpty) 'email': t(_ecEmail),
        },
        'emergencyVet': {
          'practiceName': t(_vetPractice),
          'address1': t(_vetAddress1),
          if (t(_vetAddress2).isNotEmpty) 'address2': t(_vetAddress2),
          'town': t(_vetTown),
          if (t(_vetCounty).isNotEmpty) 'county': t(_vetCounty),
          'postcode': t(_vetPostcode),
          'telephone': t(_vetTelephone),
          if (t(_vetEmail).isNotEmpty) 'email': t(_vetEmail),
        },
        'security': {
          'keysProvided': _keysProvided,
          if (t(_alarmInstructions).isNotEmpty) 'alarmInstructions': t(_alarmInstructions),
          if (t(_furtherInformation).isNotEmpty) 'furtherInformation': t(_furtherInformation),
        },
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to save changes';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit customer')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          _sectionTitle('Client details'),
          Row(children: [
            Expanded(child: _text(_firstName, 'First name *')),
            const SizedBox(width: 12),
            Expanded(child: _text(_surname, 'Surname')),
          ]),
          _text(_email, 'Email *', type: TextInputType.emailAddress),
          _text(_phone, 'Phone number *', type: TextInputType.phone),
          _text(_address1, 'Address 1 *'),
          _text(_address2, 'Address 2'),
          Row(children: [
            Expanded(child: _text(_town, 'Town *')),
            const SizedBox(width: 12),
            Expanded(child: _text(_county, 'County')),
          ]),
          _text(_postcode, 'Postcode *'),
          _sectionTitle('Emergency contact'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: const Text('Same as client'),
            value: _sameAsClient,
            onChanged: (v) => setState(() => _sameAsClient = v),
          ),
          if (!_sameAsClient) ...[
            Row(children: [
              Expanded(child: _text(_ecFirstName, 'First name *')),
              const SizedBox(width: 12),
              Expanded(child: _text(_ecSurname, 'Surname')),
            ]),
            _text(_ecPhone, 'Phone number *', type: TextInputType.phone),
            _text(_ecAddress1, 'Address 1 *'),
            _text(_ecAddress2, 'Address 2'),
            Row(children: [
              Expanded(child: _text(_ecTown, 'Town *')),
              const SizedBox(width: 12),
              Expanded(child: _text(_ecCounty, 'County')),
            ]),
            _text(_ecPostcode, 'Postcode *'),
          ],
          _text(_ecEmail, 'Email', type: TextInputType.emailAddress),
          _sectionTitle('Emergency vet'),
          _text(_vetPractice, 'Practice name'),
          _text(_vetTelephone, 'Telephone', type: TextInputType.phone),
          _text(_vetEmail, 'Email', type: TextInputType.emailAddress),
          _text(_vetAddress1, 'Address 1'),
          _text(_vetAddress2, 'Address 2'),
          Row(children: [
            Expanded(child: _text(_vetTown, 'Town')),
            const SizedBox(width: 12),
            Expanded(child: _text(_vetCounty, 'County')),
          ]),
          _text(_vetPostcode, 'Postcode'),
          _sectionTitle('Security'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: const Text('Keys provided'),
            value: _keysProvided,
            onChanged: (v) => setState(() => _keysProvided = v),
          ),
          _text(_alarmInstructions, 'Alarm instructions',
              hint: 'Leave blank to keep the current alarm code'),
          _text(_furtherInformation, 'Further information', maxLines: 3),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Saving…' : 'Save changes'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _text(TextEditingController controller, String label,
      {TextInputType? type, String? hint, int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: controller,
        keyboardType: type,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label, hintText: hint, isDense: true),
        onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.only(top: 12, bottom: 8),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
            color: Colors.grey.shade600,
          ),
        ),
      );
}
