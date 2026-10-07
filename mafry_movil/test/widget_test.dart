import 'package:flutter_test/flutter_test.dart';
import 'package:mafry_movil/api.dart';

void main() {
  test('formato de quetzales', () {
    expect(q(1234.5), 'Q1,234.50');
    expect(q('0'), 'Q0.00');
    expect(q(null), 'Q0.00');
  });
}
