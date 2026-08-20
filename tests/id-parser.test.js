"use strict";

// 核心解析器的离线回归测试：所有号码均为程序生成或公开规则示例，
// 不包含真实个人身份信息。运行方式：npm test。
require("../src/region-data.js");
require("../src/id-parser.js");

var assert = require("node:assert/strict");
var parser = globalThis.IdCardParser;

function makeId(address, birth, sequence) {
  var body = address + birth + sequence;
  return body + parser.calculateChecksum(body);
}

function findEndingX(address, birth) {
  for (var index = 1; index < 1000; index += 1) {
    var sequence = String(index).padStart(3, "0");
    var id = makeId(address, birth, sequence);
    if (id.endsWith("X")) return id;
  }
  throw new Error("无法生成 X 结尾的测试号码");
}

// 18 位号码：覆盖性别、大小写 X、校验位、日期、顺序码和区划。
var modernMale = makeId("110105", "19900101", "001");
var modernFemale = makeId("110105", "19900101", "002");
var endingX = findEndingX("110105", "20000229");

assert.equal(parser.parse(modernMale).valid, true, "合法 18 位男性号码");
assert.equal(parser.parse(modernMale).gender, "男");
assert.equal(parser.parse(modernFemale).gender, "女");
assert.equal(parser.parse(endingX.toLowerCase()).valid, true, "小写 x 自动规范化");

var brokenChecksum = modernMale.slice(0, 17) + (modernMale.endsWith("0") ? "1" : "0");
assert.equal(parser.parse(brokenChecksum).valid, false, "错误校验位");
assert.match(parser.parse(brokenChecksum).errors.join(" "), /校验位不正确/);

assert.equal(parser.parse(makeId("110105", "20000229", "001")).valid, true, "闰日");
assert.equal(parser.parse(makeId("110105", "20010229", "001")).valid, false, "平年闰日");
assert.equal(parser.parse(makeId("110105", "29990101", "001")).valid, false, "未来日期");
assert.equal(parser.parse(makeId("110105", "19900101", "000")).valid, false, "000 顺序码");
assert.equal(parser.parse(makeId("110199", "19900101", "001")).valid, false, "虚构区县");

var historical = parser.parse(makeId("110103", "19891231", "001"));
assert.equal(historical.valid, true, "历史区划仍可识别");
assert.equal(historical.region.historical, true);
assert.match(historical.warnings.join(" "), /历史区划/);

// 15 位旧号码与双向转换规则。
var legacy = parser.parse("110105900101001");
assert.equal(legacy.valid, true, "合法 15 位旧号码");
assert.equal(legacy.format, "15");
assert.equal(legacy.birthDate.iso, "1990-01-01");
assert.equal(legacy.normalized.length, 18);
assert.equal(parser.parse(legacy.normalized).valid, true, "旧号码换算结果");
assert.equal(legacy.conversion.targetFormat, "18");
assert.equal(legacy.conversion.value, legacy.normalized, "15 位转 18 位");

var modernToLegacy = parser.convert(legacy.normalized);
assert.equal(modernToLegacy.possible, true, "19xx 出生的 18 位号码可转 15 位");
assert.equal(modernToLegacy.value, "110105900101001", "18 位还原为 15 位");

var post2000 = parser.parse(makeId("110105", "20000229", "001"));
assert.equal(post2000.valid, true);
assert.equal(post2000.conversion.possible, false, "2000 年出生号码不能转为 15 位");
assert.match(post2000.conversion.reason, /19xx/);

assert.equal(parser.convert("1234").possible, false, "无效号码不可转换");

// 常见失败分支。
assert.equal(parser.parse("110105010229001").valid, false, "15 位错误日期");
assert.equal(parser.parse("11010519900101001A").valid, false, "非法字符");
assert.equal(parser.parse("1234").valid, false, "错误长度");
assert.equal(parser.parse(makeId("810000", "19900101", "001")).valid, false, "非大陆地址码");

console.log("身份证解析器核心测试全部通过");
