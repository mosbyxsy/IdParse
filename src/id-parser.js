(function (global) {
  "use strict";

  // GB 11643-1999：前 17 位的固定权重，以及“加权和模 11”对应的校验位。
  var CHECKSUM_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  var CHECKSUM_MAP = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

  // 统一每一项规则检查的数据结构，供界面直接渲染。
  function createCheck(key, label, status, detail) {
    return {
      key: key,
      label: label,
      status: status,
      valid: status === "pass",
      detail: detail || ""
    };
  }

  // 校验位公式：S = Σ(aᵢ × Wᵢ)，再用 S mod 11 查询 CHECKSUM_MAP。
  function calculateChecksum(body) {
    if (!/^\d{17}$/.test(String(body))) return null;

    var sum = String(body).split("").reduce(function (total, digit, index) {
      return total + Number(digit) * CHECKSUM_WEIGHTS[index];
    }, 0);
    return CHECKSUM_MAP[sum % 11];
  }

  // 直辖市等区划层级可能出现同名，拼接显示名称时需要去重。
  function uniqueParts(parts) {
    return parts.filter(function (part, index) {
      return part && parts.indexOf(part) === index;
    });
  }

  // 将压缩元组转换为有名称的地区对象，解析核心不直接依赖数组下标。
  function findRegion(code) {
    var regionStore = global.IdRegionData && global.IdRegionData.regions;
    var tuple = regionStore && regionStore[code];
    if (!tuple) return null;

    var province = tuple[0] || "";
    var city = tuple[1] || "";
    var county = tuple[2] || "";
    return {
      code: code,
      province: province,
      city: city,
      county: county,
      fullName: uniqueParts([province, city, county]).join(" · "),
      historical: Boolean(tuple[3]),
      successor: tuple[4] || "",
      endYear: tuple[5] || null,
      aliases: tuple[6] ? tuple[6].split("、") : []
    };
  }

  // 严格检查 YYYYMMDD：包含闰年、各月天数以及“不能晚于今天”。
  function parseDate(dateCode) {
    if (!/^\d{8}$/.test(dateCode)) {
      return { valid: false, error: "出生日期格式应为 YYYYMMDD。" };
    }

    var year = Number(dateCode.slice(0, 4));
    var month = Number(dateCode.slice(4, 6));
    var day = Number(dateCode.slice(6, 8));
    var now = new Date();
    var todayCode =
      String(now.getFullYear()).padStart(4, "0") +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");

    if (year < 1800 || year > now.getFullYear()) {
      return { valid: false, error: "出生年份需在 1800 年至当前年份之间。" };
    }
    if (month < 1 || month > 12) {
      return { valid: false, error: "出生月份不正确。" };
    }

    var isLeapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    var daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > daysInMonth[month - 1]) {
      return { valid: false, error: "出生日期不是有效的公历日期。" };
    }
    if (dateCode > todayCode) {
      return { valid: false, error: "出生日期不能晚于今天。" };
    }

    var monthText = String(month).padStart(2, "0");
    var dayText = String(day).padStart(2, "0");
    return {
      valid: true,
      value: {
        year: year,
        month: month,
        day: day,
        iso: year + "-" + monthText + "-" + dayText,
        formatted: year + "年" + monthText + "月" + dayText + "日"
      }
    };
  }

  // 主解析流程依次检查：格式 → 区划 → 日期 → 顺序码 → 校验位。
  // 所有失败原因都会累计到 errors，并保留逐项 checks 供界面解释。
  function parse(value) {
    var raw = String(value == null ? "" : value).trim().toUpperCase();
    var result = {
      valid: false,
      format: null,
      normalized: raw,
      region: null,
      gender: null,
      birthDate: null,
      conversion: null,
      errors: [],
      warnings: [],
      checks: []
    };
    var isLegacy = /^\d{15}$/.test(raw);
    var isModern = /^\d{17}[\dX]$/.test(raw);

    if (!isLegacy && !isModern) {
      var hasIllegalCharacter =
        /[^\dX]/.test(raw) || (raw.indexOf("X") !== -1 && !/^\d{17}X$/.test(raw));
      var formatError = !raw
        ? "请输入身份证号码。"
        : hasIllegalCharacter
          ? "号码只能包含数字，18 位号码末位可为 X。"
          : "号码长度应为 15 位或 18 位。";
      result.errors.push(formatError);
      result.checks.push(createCheck("format", "号码格式", "fail", formatError));
      result.checks.push(createCheck("region", "行政区划", "pending", "等待正确的号码格式"));
      result.checks.push(createCheck("birthDate", "出生日期", "pending", "等待正确的号码格式"));
      result.checks.push(createCheck("sequence", "顺序码", "pending", "等待正确的号码格式"));
      result.checks.push(createCheck("checksum", "校验位", "pending", "等待正确的号码格式"));
      return result;
    }

    result.format = isModern ? "18" : "15";
    result.checks.push(createCheck(
      "format",
      "号码格式",
      "pass",
      isModern ? "符合 18 位号码结构" : "符合 15 位旧号码结构"
    ));

    var regionCode = raw.slice(0, 6);
    var region = findRegion(regionCode);
    if (region) {
      result.region = region;
      result.checks.push(createCheck(
        "region",
        "行政区划",
        "pass",
        region.fullName + "（" + region.code + "）"
      ));
      if (region.historical) {
        var historyMessage =
          region.fullName +
          "属于历史区划代码" +
          (region.endYear ? "，于 " + region.endYear + " 年停用" : "");
        if (region.successor) historyMessage += "，当前对应：" + region.successor;
        result.warnings.push(historyMessage + "。");
      }
    } else {
      var regionError = "未找到地址码 " + regionCode + " 对应的大陆县级行政区划。";
      result.errors.push(regionError);
      result.checks.push(createCheck("region", "行政区划", "fail", regionError));
    }

    // 15 位旧号码没有世纪位，按旧制约定补为 19YY。
    var dateCode = isModern ? raw.slice(6, 14) : "19" + raw.slice(6, 12);
    var dateResult = parseDate(dateCode);
    if (dateResult.valid) {
      result.birthDate = dateResult.value;
      result.checks.push(createCheck("birthDate", "出生日期", "pass", dateResult.value.formatted));
    } else {
      result.errors.push(dateResult.error);
      result.checks.push(createCheck("birthDate", "出生日期", "fail", dateResult.error));
    }

    // 顺序码末位奇数表示男性，偶数表示女性；000 不属于有效顺序码。
    var sequence = isModern ? raw.slice(14, 17) : raw.slice(12, 15);
    if (sequence === "000") {
      var sequenceError = "顺序码不能为 000。";
      result.errors.push(sequenceError);
      result.checks.push(createCheck("sequence", "顺序码", "fail", sequenceError));
    } else {
      result.gender = Number(sequence.charAt(2)) % 2 === 1 ? "男" : "女";
      result.checks.push(createCheck("sequence", "顺序码", "pass", sequence + " · " + result.gender + "性"));
    }

    // 18 位号码必须验证末位；15 位号码本身没有校验位，只计算转换结果。
    if (isModern) {
      var expectedChecksum = calculateChecksum(raw.slice(0, 17));
      var actualChecksum = raw.charAt(17);
      if (actualChecksum === expectedChecksum) {
        result.checks.push(createCheck("checksum", "校验位", "pass", "校验位 " + actualChecksum + " 正确"));
      } else {
        var checksumError =
          "校验位不正确：当前为 " + actualChecksum + "，按前 17 位计算应为 " + expectedChecksum + "。";
        result.errors.push(checksumError);
        result.checks.push(createCheck("checksum", "校验位", "fail", checksumError));
      }
    } else {
      // 插入世纪位后形成 17 位主体，再按同一权重规则生成第 18 位。
      var body = raw.slice(0, 6) + "19" + raw.slice(6);
      var convertedChecksum = calculateChecksum(body);
      result.normalized = body + convertedChecksum;
      result.warnings.push("15 位号码是旧版格式，原号码没有校验位；可按 19YY 出生年份规则转换为 18 位号码。");
      result.checks.push(createCheck(
        "checksum",
        "校验位换算",
        "info",
        "旧号码无校验位，可使用转换功能生成校验位"
      ));
    }

    result.valid = result.errors.length === 0;

    // 仅为已通过校验的号码提供格式转换，避免产生看似合法的错误结果。
    if (result.valid && isLegacy) {
      result.conversion = {
        possible: true,
        sourceFormat: "15",
        targetFormat: "18",
        value: result.normalized,
        reason: "",
        note: "已补充世纪位 19，并按前 17 位计算校验位。"
      };
    }

    if (result.valid && isModern) {
      // 15 位格式只能表达 19xx 年；其他世纪无法无歧义地降级。
      if (dateCode.slice(0, 2) === "19") {
        result.conversion = {
          possible: true,
          sourceFormat: "18",
          targetFormat: "15",
          value: raw.slice(0, 6) + raw.slice(8, 17),
          reason: "",
          note: "已移除世纪位 19 与末位校验码，仅表示旧版号码格式。"
        };
      } else {
        result.conversion = {
          possible: false,
          sourceFormat: "18",
          targetFormat: "15",
          value: null,
          reason: "15 位旧格式不包含世纪位，仅出生年份为 19xx 的号码可以无歧义转换。",
          note: ""
        };
      }
    }

    return result;
  }

  function convert(value) {
    var parsed = parse(value);
    if (parsed.valid) return parsed.conversion;

    return {
      possible: false,
      sourceFormat: parsed.format,
      targetFormat: parsed.format === "15" ? "18" : parsed.format === "18" ? "15" : null,
      value: null,
      reason: parsed.errors[0] || "号码未通过校验。",
      note: ""
    };
  }

  // 暴露稳定的只读公共 API，页面和测试代码均通过此入口调用。
  global.IdCardParser = Object.freeze({
    parse: parse,
    convert: convert,
    calculateChecksum: calculateChecksum,
    findRegion: findRegion,
    dataVersion: (global.IdRegionData && global.IdRegionData.version) || "unavailable"
  });
})(typeof window !== "undefined" ? window : globalThis);
