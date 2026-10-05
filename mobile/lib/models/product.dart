/// A reusable catalogue entry staff pick from when building invoice line
/// items, so descriptions and prices come from a fixed list rather than being
/// typed by hand. Mirrors the backend Product schema.
class Product {
  final String id;
  final String productCode;
  final String name;
  final String? description;
  final double price;
  // Optional day-type restriction: 'weekday' | 'weekend' | 'bank_holiday'.
  // Null means unrestricted (usable any day).
  final String? availability;

  /// Opt-in flag (Settings > Invoice/Quotes > Products) for the Business >
  /// Price List screen.
  final bool displayInPriceList;

  Product({
    required this.id,
    required this.productCode,
    required this.name,
    this.description,
    required this.price,
    this.availability,
    this.displayInPriceList = false,
  });

  factory Product.fromJson(Map<String, dynamic> json) => Product(
        id: json['_id'] as String,
        productCode: json['productCode'] as String? ?? '',
        name: json['name'] as String? ?? '',
        description: json['description'] as String?,
        price: (json['price'] as num?)?.toDouble() ?? 0,
        availability: json['availability'] as String?,
        displayInPriceList: json['displayInPriceList'] as bool? ?? false,
      );
}
