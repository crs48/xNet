import XCTest
import Foundation
@testable import XNetKit

/// Locks the byte-exact canonicalization fixes from the 0210 adversarial review.
final class CanonicalTests: XCTestCase {
    /// Object keys MUST sort by UTF-16 code unit (JS `Array.prototype.sort`),
    /// not by Unicode scalar. These differ for astral-plane keys: 😀 (U+1F600)
    /// begins with the high surrogate 0xD83D (< 0xFFFF), so it sorts before "￿".
    func testKeysSortByUTF16CodeUnit() {
        let obj = JSONValue.object(["z": .int(1), "\u{1F600}": .int(2), "\u{FFFF}": .int(3)])
        XCTAssertEqual(obj.canonicalJSON(), "{\"z\":1,\"\u{1F600}\":2,\"\u{FFFF}\":3}")
        // Sanity: Swift's default scalar sort would put ￿ before 😀 (the bug).
        XCTAssertEqual(["z", "\u{1F600}", "\u{FFFF}"].sorted(), ["z", "\u{FFFF}", "\u{1F600}"])
    }

    /// Integer-valued numbers (incl. > 2^53 up to Int64) serialize like JS:
    /// "10000000000000000", never "1e+16" or "2.0".
    func testIntegerValuedDoubles() {
        XCTAssertEqual(JSONValue.double(2.0).canonicalJSON(), "2")
        XCTAssertEqual(JSONValue.double(1e16).canonicalJSON(), "10000000000000000")
        XCTAssertEqual(JSONValue.int(1_718_641_200_000).canonicalJSON(), "1718641200000")
        // A value JSONSerialization gives back as a large NSNumber stays integral.
        let parsed = JSONValue.from(foundation: try! JSONSerialization.jsonObject(
            with: Data("{\"n\":10000000000000000}".utf8)))
        XCTAssertEqual(parsed.canonicalJSON(), "{\"n\":10000000000000000}")
    }

    func testNumericAndBoolComparison() {
        XCTAssertEqual(JSONValue.compare(.double(2.5), .int(3)), .orderedAscending)
        XCTAssertEqual(JSONValue.compare(.double(3.0), .int(3)), .orderedSame)
        XCTAssertEqual(JSONValue.compare(.int(5), .double(4.5)), .orderedDescending)
        XCTAssertEqual(JSONValue.compare(.bool(false), .bool(true)), .orderedAscending)
        XCTAssertEqual(JSONValue.compare(.string("a"), .string("b")), .orderedAscending)
    }
}
