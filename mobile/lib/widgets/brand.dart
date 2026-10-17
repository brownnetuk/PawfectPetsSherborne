import 'package:flutter/material.dart';
import '../theme.dart';

/// The header-band title from the booking-confirmation PDF: the round logo,
/// the "PAWFECT PETS · SHERBORNE" eyebrow, and a display-font title whose
/// [highlight] word is picked out in underlined yellow ("Booking confirmed").
/// Used as the AppBar title of the top-level tabs (give the AppBar
/// `toolbarHeight: brandTitleHeight`).
class BrandTitle extends StatelessWidget {
  final String lead;
  final String highlight;
  const BrandTitle({super.key, this.lead = '', required this.highlight});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 40,
          height: 40,
          padding: const EdgeInsets.all(5),
          decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
          child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'PAWFECT PETS · SHERBORNE',
                style: TextStyle(
                  fontFamily: bodyFont,
                  fontSize: 9.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.8,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 2),
              Text.rich(
                TextSpan(
                  children: [
                    if (lead.isNotEmpty) TextSpan(text: '$lead '),
                    TextSpan(
                      text: highlight,
                      style: const TextStyle(
                        color: brandYellow,
                        decoration: TextDecoration.underline,
                        decorationColor: brandYellow,
                        decorationThickness: 2,
                      ),
                    ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontFamily: displayFont, fontSize: 22, color: Colors.white, height: 1.15),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

const brandTitleHeight = 76.0;

/// A booking reference (BK00010) as the PDF's yellow pill.
class RefPill extends StatelessWidget {
  final String reference;
  final double fontSize;
  const RefPill(this.reference, {super.key, this.fontSize = 14});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 3),
      decoration: BoxDecoration(color: brandYellow, borderRadius: BorderRadius.circular(999)),
      child: Text(reference, style: TextStyle(fontFamily: displayFont, fontSize: fontSize, color: brandBlue)),
    );
  }
}

/// Small-caps section label, as the PDF's "BEFORE AUTUMN ARRIVES" headings.
class BrandSectionLabel extends StatelessWidget {
  final String title;
  final EdgeInsetsGeometry padding;
  const BrandSectionLabel(this.title, {super.key, this.padding = const EdgeInsets.only(top: 16, bottom: 8)});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: brandBlue),
      ),
    );
  }
}

/// The PDF's panel heading: a display-font title in blue with a short yellow
/// bar underneath ("Your booking", "Payment").
class BrandHeading extends StatelessWidget {
  final String title;
  final EdgeInsetsGeometry padding;
  const BrandHeading(this.title, {super.key, this.padding = const EdgeInsets.only(top: 20, bottom: 8)});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontFamily: displayFont, fontSize: 17, color: brandBlue)),
          const SizedBox(height: 5),
          Container(
            width: 26,
            height: 3,
            decoration: BoxDecoration(color: brandYellow, borderRadius: BorderRadius.circular(2)),
          ),
        ],
      ),
    );
  }
}
