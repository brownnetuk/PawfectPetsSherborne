/// The business's own details, used to brand the invoice PDF. Mirrors the
/// subset of the backend BusinessInfo singleton the mobile app needs.
class BusinessInfo {
  final String? name;
  final String? address;
  final String? town;
  final String? postcode;
  final String? telephone;
  final String? email;
  final String? website;
  final String? bankName;
  final String? sortCode;
  final String? accountNumber;
  final String? invoiceNotesMessage;

  BusinessInfo({
    this.name,
    this.address,
    this.town,
    this.postcode,
    this.telephone,
    this.email,
    this.website,
    this.bankName,
    this.sortCode,
    this.accountNumber,
    this.invoiceNotesMessage,
  });

  factory BusinessInfo.fromJson(Map<String, dynamic> json) => BusinessInfo(
        name: json['name'] as String?,
        address: json['address'] as String?,
        town: json['town'] as String?,
        postcode: json['postcode'] as String?,
        telephone: json['telephone'] as String?,
        email: json['email'] as String?,
        website: json['website'] as String?,
        bankName: json['bankName'] as String?,
        sortCode: json['sortCode'] as String?,
        accountNumber: json['accountNumber'] as String?,
        invoiceNotesMessage: json['invoiceNotesMessage'] as String?,
      );
}
