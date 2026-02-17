"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const packageUtils_js_1 = require("../packageUtils.js");
// ────────────────────────────────────────────────────────────────────────────
// buildPackageMap
// ────────────────────────────────────────────────────────────────────────────
describe("buildPackageMap", () => {
    it("returns an empty map when given an empty array", () => {
        const result = (0, packageUtils_js_1.buildPackageMap)([]);
        assert.strictEqual(result.size, 0);
    });
    it("sets wildcard for parent nodes that accept *", () => {
        const nodes = [{ text: "ApexClass", parent: "#" }];
        const result = (0, packageUtils_js_1.buildPackageMap)(nodes);
        assert.deepStrictEqual(result.get("ApexClass"), ["*"]);
    });
    it("sets empty array for parent nodes that do NOT accept *", () => {
        const nodes = [{ text: "SomeCustomType", parent: "#" }];
        const result = (0, packageUtils_js_1.buildPackageMap)(nodes);
        assert.deepStrictEqual(result.get("SomeCustomType"), []);
    });
    it("adds children under their parent type", () => {
        const nodes = [
            { text: "MyClass", parent: "ApexClass" },
            { text: "OtherClass", parent: "ApexClass" },
        ];
        const result = (0, packageUtils_js_1.buildPackageMap)(nodes);
        assert.deepStrictEqual(result.get("ApexClass"), ["MyClass", "OtherClass"]);
    });
    it("does not add children when parent already has wildcard", () => {
        const nodes = [
            { text: "ApexClass", parent: "#" },
            { text: "MyClass", parent: "ApexClass" },
        ];
        const result = (0, packageUtils_js_1.buildPackageMap)(nodes);
        assert.deepStrictEqual(result.get("ApexClass"), ["*"]);
    });
    it("skips loading placeholder nodes", () => {
        const nodes = [{ text: "*loading..", parent: "ApexClass" }];
        const result = (0, packageUtils_js_1.buildPackageMap)(nodes);
        assert.strictEqual(result.size, 0);
    });
    it("handles mix of parents and children across types", () => {
        const nodes = [
            { text: "ApexClass", parent: "#" },
            { text: "MyPage", parent: "ApexPage" },
            { text: "SomeCustomType", parent: "#" },
        ];
        const result = (0, packageUtils_js_1.buildPackageMap)(nodes);
        assert.deepStrictEqual(result.get("ApexClass"), ["*"]);
        assert.deepStrictEqual(result.get("ApexPage"), ["MyPage"]);
        assert.deepStrictEqual(result.get("SomeCustomType"), []);
    });
    it("upgrades to wildcard when parent is selected after children", () => {
        const nodes = [
            { text: "MyClass", parent: "ApexClass" },
            { text: "ApexClass", parent: "#" },
        ];
        const result = (0, packageUtils_js_1.buildPackageMap)(nodes);
        assert.deepStrictEqual(result.get("ApexClass"), ["*"]);
    });
});
// ────────────────────────────────────────────────────────────────────────────
// buildSelectedMetadataMap
// ────────────────────────────────────────────────────────────────────────────
describe("buildSelectedMetadataMap", () => {
    it("returns an empty map for empty input", () => {
        assert.strictEqual((0, packageUtils_js_1.buildSelectedMetadataMap)([]).size, 0);
        assert.strictEqual((0, packageUtils_js_1.buildSelectedMetadataMap)(null).size, 0);
        assert.strictEqual((0, packageUtils_js_1.buildSelectedMetadataMap)(undefined).size, 0);
    });
    it("uses wildcard for fully selected wildcard-eligible types", () => {
        const types = [
            {
                id: "ApexClass",
                isSelected: true,
                children: [
                    { text: "A", isSelected: true },
                    { text: "B", isSelected: true },
                ],
            },
        ];
        const result = (0, packageUtils_js_1.buildSelectedMetadataMap)(types);
        assert.deepStrictEqual(result.get("ApexClass"), ["*"]);
    });
    it("lists all children for fully selected non-wildcard types", () => {
        const types = [
            {
                id: "SomeCustomType",
                isSelected: true,
                children: [
                    { text: "X", isSelected: true },
                    { text: "Y", isSelected: true },
                ],
            },
        ];
        const result = (0, packageUtils_js_1.buildSelectedMetadataMap)(types);
        assert.deepStrictEqual(result.get("SomeCustomType"), ["X", "Y"]);
    });
    it("only includes selected children for indeterminate types", () => {
        const types = [
            {
                id: "ApexTrigger",
                isSelected: false,
                isIndeterminate: true,
                children: [
                    { text: "TrigA", isSelected: true },
                    { text: "TrigB", isSelected: false },
                    { text: "TrigC", isSelected: true },
                ],
            },
        ];
        const result = (0, packageUtils_js_1.buildSelectedMetadataMap)(types);
        assert.deepStrictEqual(result.get("ApexTrigger"), ["TrigA", "TrigC"]);
    });
    it("skips unselected, non-indeterminate types", () => {
        const types = [
            {
                id: "ApexClass",
                isSelected: false,
                children: [{ text: "A", isSelected: false }],
            },
        ];
        const result = (0, packageUtils_js_1.buildSelectedMetadataMap)(types);
        assert.strictEqual(result.size, 0);
    });
    it("skips indeterminate types with zero selected children", () => {
        const types = [
            {
                id: "Flow",
                isSelected: false,
                isIndeterminate: true,
                children: [
                    { text: "F1", isSelected: false },
                    { text: "F2", isSelected: false },
                ],
            },
        ];
        const result = (0, packageUtils_js_1.buildSelectedMetadataMap)(types);
        assert.strictEqual(result.size, 0);
    });
});
// ────────────────────────────────────────────────────────────────────────────
// generatePackageXmlString
// ────────────────────────────────────────────────────────────────────────────
describe("generatePackageXmlString", () => {
    it("returns null for empty map", () => {
        assert.strictEqual((0, packageUtils_js_1.generatePackageXmlString)(new Map(), "62.0"), null);
    });
    it("returns null for undefined map", () => {
        assert.strictEqual((0, packageUtils_js_1.generatePackageXmlString)(undefined, "62.0"), null);
    });
    it("generates valid XML for a single type with wildcard", () => {
        const mp = new Map([["ApexClass", ["*"]]]);
        const xml = (0, packageUtils_js_1.generatePackageXmlString)(mp, "62.0");
        assert.ok(xml.startsWith('<?xml version="1.0"'));
        assert.ok(xml.includes("<members>*</members>"));
        assert.ok(xml.includes("<name>ApexClass</name>"));
        assert.ok(xml.includes("<version>62.0</version>"));
        assert.ok(xml.endsWith("</Package>"));
    });
    it("sorts members alphabetically within a type", () => {
        const mp = new Map([["ApexClass", ["Zebra", "Alpha", "Middle"]]]);
        const xml = (0, packageUtils_js_1.generatePackageXmlString)(mp, "62.0");
        const alphaIdx = xml.indexOf("Alpha");
        const middleIdx = xml.indexOf("Middle");
        const zebraIdx = xml.indexOf("Zebra");
        assert.ok(alphaIdx < middleIdx);
        assert.ok(middleIdx < zebraIdx);
    });
    it("sorts types alphabetically by name", () => {
        const mp = new Map([
            ["Profile", ["Admin"]],
            ["ApexClass", ["*"]],
            ["Layout", ["Account"]],
        ]);
        const xml = (0, packageUtils_js_1.generatePackageXmlString)(mp, "62.0");
        const apexIdx = xml.indexOf("<name>ApexClass</name>");
        const layoutIdx = xml.indexOf("<name>Layout</name>");
        const profileIdx = xml.indexOf("<name>Profile</name>");
        assert.ok(apexIdx < layoutIdx);
        assert.ok(layoutIdx < profileIdx);
    });
    it("skips types with empty member arrays", () => {
        const mp = new Map([
            ["ApexClass", ["*"]],
            ["EmptyType", []],
        ]);
        const xml = (0, packageUtils_js_1.generatePackageXmlString)(mp, "62.0");
        assert.ok(!xml.includes("EmptyType"));
        assert.ok(xml.includes("ApexClass"));
    });
    it("uses the provided API version", () => {
        const mp = new Map([["ApexClass", ["*"]]]);
        const xml = (0, packageUtils_js_1.generatePackageXmlString)(mp, "59.0");
        assert.ok(xml.includes("<version>59.0</version>"));
    });
    it("generates correct XML structure with multiple types and members", () => {
        const mp = new Map([
            ["ApexClass", ["ClassA", "ClassB"]],
            ["ApexTrigger", ["TrigA"]],
        ]);
        const xml = (0, packageUtils_js_1.generatePackageXmlString)(mp, "62.0");
        // Count <types> blocks
        const typesCount = (xml.match(/<types>/g) || []).length;
        assert.strictEqual(typesCount, 2);
        // Verify structure
        assert.ok(xml.includes("<members>ClassA</members>"));
        assert.ok(xml.includes("<members>ClassB</members>"));
        assert.ok(xml.includes("<members>TrigA</members>"));
        assert.ok(xml.includes("<name>ApexClass</name>"));
        assert.ok(xml.includes("<name>ApexTrigger</name>"));
    });
});
// ────────────────────────────────────────────────────────────────────────────
// filterRetrievableTypes
// ────────────────────────────────────────────────────────────────────────────
describe("filterRetrievableTypes", () => {
    it("removes all known non-retrievable types", () => {
        const input = [...packageUtils_js_1.NON_RETRIEVABLE_TYPES];
        const result = (0, packageUtils_js_1.filterRetrievableTypes)(input);
        assert.strictEqual(result.length, 0);
    });
    it("keeps retrievable types untouched", () => {
        const input = ["ApexClass", "ApexTrigger", "Flow"];
        const result = (0, packageUtils_js_1.filterRetrievableTypes)(input);
        assert.deepStrictEqual(result, ["ApexClass", "ApexTrigger", "Flow"]);
    });
    it("filters a mixed list correctly", () => {
        const input = ["ApexClass", "EventDelivery", "Flow", "CustomObject", "Layout"];
        const result = (0, packageUtils_js_1.filterRetrievableTypes)(input);
        assert.deepStrictEqual(result, ["ApexClass", "Flow", "Layout"]);
    });
    it("returns empty array for empty input", () => {
        assert.deepStrictEqual((0, packageUtils_js_1.filterRetrievableTypes)([]), []);
    });
});
// ────────────────────────────────────────────────────────────────────────────
// isCacheValid
// ────────────────────────────────────────────────────────────────────────────
describe("isCacheValid", () => {
    it("returns false for null cache", () => {
        assert.strictEqual((0, packageUtils_js_1.isCacheValid)(null, "62.0"), false);
    });
    it("returns false when cache has no timestamp", () => {
        assert.strictEqual((0, packageUtils_js_1.isCacheValid)({ apiVersion: "62.0" }, "62.0"), false);
    });
    it("returns false when API version does not match", () => {
        const cache = { timestamp: Date.now(), apiVersion: "61.0" };
        assert.strictEqual((0, packageUtils_js_1.isCacheValid)(cache, "62.0"), false);
    });
    it("returns false when cache is expired", () => {
        const cache = {
            timestamp: Date.now() - packageUtils_js_1.CACHE_TTL_MS - 1000,
            apiVersion: "62.0",
        };
        assert.strictEqual((0, packageUtils_js_1.isCacheValid)(cache, "62.0"), false);
    });
    it("returns true for a fresh cache with matching version", () => {
        const cache = { timestamp: Date.now() - 1000, apiVersion: "62.0" };
        assert.strictEqual((0, packageUtils_js_1.isCacheValid)(cache, "62.0"), true);
    });
    it("returns true for a cache right at the TTL boundary", () => {
        const cache = { timestamp: Date.now() - packageUtils_js_1.CACHE_TTL_MS, apiVersion: "62.0" };
        assert.strictEqual((0, packageUtils_js_1.isCacheValid)(cache, "62.0"), true);
    });
});
// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
describe("constants", () => {
    it("NON_RETRIEVABLE_TYPES contains expected deprecated types", () => {
        assert.ok(packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("EventDelivery"));
        assert.ok(packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("EventSubscription"));
        assert.ok(packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("Scontrol"));
        assert.ok(packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("ArticleType"));
    });
    it("NON_RETRIEVABLE_TYPES contains expected child types", () => {
        assert.ok(packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("CustomField"));
        assert.ok(packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("ValidationRule"));
        assert.ok(packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("RecordType"));
        assert.ok(packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("ListView"));
    });
    it("NON_RETRIEVABLE_TYPES does not include valid types", () => {
        assert.ok(!packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("ApexClass"));
        assert.ok(!packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("Flow"));
        assert.ok(!packageUtils_js_1.NON_RETRIEVABLE_TYPES.has("Layout"));
    });
    it("WILDCARD_TYPES contains common wildcard-eligible types", () => {
        assert.ok(packageUtils_js_1.WILDCARD_TYPES.has("ApexClass"));
        assert.ok(packageUtils_js_1.WILDCARD_TYPES.has("ApexTrigger"));
        assert.ok(packageUtils_js_1.WILDCARD_TYPES.has("LightningComponentBundle"));
        assert.ok(packageUtils_js_1.WILDCARD_TYPES.has("Flow"));
        assert.ok(packageUtils_js_1.WILDCARD_TYPES.has("Profile"));
        assert.ok(packageUtils_js_1.WILDCARD_TYPES.has("PermissionSet"));
    });
    it("REPORT_FOLDER_MAP has the four folder-based types", () => {
        assert.strictEqual(Object.keys(packageUtils_js_1.REPORT_FOLDER_MAP).length, 4);
        assert.strictEqual(packageUtils_js_1.REPORT_FOLDER_MAP.Dashboard, "DashboardFolder");
        assert.strictEqual(packageUtils_js_1.REPORT_FOLDER_MAP.Document, "DocumentFolder");
        assert.strictEqual(packageUtils_js_1.REPORT_FOLDER_MAP.EmailTemplate, "EmailFolder");
        assert.strictEqual(packageUtils_js_1.REPORT_FOLDER_MAP.Report, "ReportFolder");
    });
    it("FALLBACK_API_VERSION is a valid version string", () => {
        assert.match(packageUtils_js_1.FALLBACK_API_VERSION, /^\d+\.\d+$/);
    });
    it("CACHE_TTL_MS equals 24 hours in milliseconds", () => {
        assert.strictEqual(packageUtils_js_1.CACHE_TTL_MS, 86400000);
    });
});
//# sourceMappingURL=packageUtils.test.js.map