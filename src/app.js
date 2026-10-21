(function () {
  "use strict";

  // 页面交互层：负责输入约束、结果渲染、复制、格式转换和本地历史记录。
  // 身份证规则本身集中在 id-parser.js，避免界面逻辑与校验算法互相耦合。

  // 缓存页面节点，后续渲染时不重复查询 DOM。
  var form = document.getElementById("id-form");
  var input = document.getElementById("id-number");
  var inputCopyButton = document.getElementById("input-copy-button");
  var inputClearButton = document.getElementById("input-clear-button");
  var parseButton = document.getElementById("parse-button");
  var resetButton = document.getElementById("reset-button");
  var charCount = document.getElementById("char-count");
  var resultPanel = document.getElementById("result-panel");
  var statusBanner = document.getElementById("status-banner");
  var statusIcon = document.getElementById("status-icon");
  var statusKicker = document.getElementById("status-kicker");
  var statusTitle = document.getElementById("status-title");
  var statusDescription = document.getElementById("status-description");
  var warningBox = document.getElementById("warning-box");
  var warningTitle = document.getElementById("warning-title");
  var warningText = document.getElementById("warning-text");
  var detailsSection = document.getElementById("details-section");
  var formatChip = document.getElementById("format-chip");
  var regionMapLink = document.getElementById("region-map-link");
  var resultRegion = document.getElementById("result-region");
  var resultRegionCode = document.getElementById("result-region-code");
  var resultGender = document.getElementById("result-gender");
  var resultBirth = document.getElementById("result-birth");
  var resultBirthExtras = document.getElementById("result-birth-extras");
  var conversionEntry = document.getElementById("conversion-entry");
  var conversionEntryLabel = document.getElementById("conversion-entry-label");
  var conversionResultCard = document.getElementById("conversion-result-card");
  var conversionResultLabel = document.getElementById("conversion-result-label");
  var conversionResultNumber = document.getElementById("conversion-result-number");
  var conversionResultNote = document.getElementById("conversion-result-note");
  var conversionRunButton = document.getElementById("conversion-run-button");
  var conversionCopyButton = document.getElementById("conversion-copy-button");
  var checkSummary = document.getElementById("check-summary");
  var checksList = document.getElementById("checks-list");
  var historyList = document.getElementById("history-list");
  var parseHistory = document.querySelector(".parse-history");
  var historyEmpty = document.getElementById("history-empty");
  var historyCount = document.getElementById("history-count");
  var historyToggleButton = document.getElementById("history-toggle-button");
  var historyClearButton = document.getElementById("history-clear-button");

  // 页面会话状态；历史记录最多保存 20 条，且只写入当前浏览器。
  var convertedNumber = "";
  var pendingConversion = null;
  var inputCopyTimeoutId = null;
  var HISTORY_STORAGE_KEY = "id-card-parser-history-v1";
  var HISTORY_LIMIT = 20;
  var isHistoryExpanded = false;
  var historyMobileQuery = window.matchMedia("(max-width: 520px)");
  var historyRecords = loadHistory();

  // 读取历史时同时校验数据结构，忽略旧版本或被破坏的记录。
  function loadHistory() {
    try {
      var stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!stored) return [];
      var parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(function (record) {
          return (
            record &&
            typeof record.number === "string" &&
            (record.format === "15" || record.format === "18") &&
            typeof record.region === "string" &&
            typeof record.gender === "string" &&
            typeof record.birthDate === "string" &&
            Number.isFinite(record.createdAt) &&
            !Number.isNaN(new Date(record.createdAt).getTime())
          );
        })
        .slice(0, HISTORY_LIMIT);
    } catch (error) {
      return [];
    }
  }

  function persistHistory() {
    try {
      if (historyRecords.length) {
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyRecords));
      } else {
        window.localStorage.removeItem(HISTORY_STORAGE_KEY);
      }
    } catch (error) {
      // localStorage 被禁用时，历史仍可在当前页面会话内使用。
    }
  }

  // 使用 textContent 动态创建历史项，避免把号码内容当作 HTML 注入页面。
  function renderHistory() {
    historyList.replaceChildren();
    parseHistory.classList.toggle("is-expanded", isHistoryExpanded);
    historyCount.textContent = historyRecords.length + " 条";
    historyEmpty.hidden = historyRecords.length !== 0;
    historyList.hidden = historyRecords.length === 0;
    historyClearButton.disabled = historyRecords.length === 0;
    historyToggleButton.hidden = historyRecords.length === 0;
    historyToggleButton.textContent = isHistoryExpanded
      ? "收起"
      : historyMobileQuery.matches
        ? "查看历史记录"
        : "查看详情";
    historyToggleButton.setAttribute("aria-expanded", String(isHistoryExpanded));

    var fragment = document.createDocumentFragment();
    historyRecords.forEach(function (record) {
      var item = document.createElement("li");
      item.className = "history-item";

      var openButton = document.createElement("button");
      openButton.className = "history-item__open";
      openButton.type = "button";
      openButton.dataset.historyNumber = record.number;
      openButton.setAttribute("aria-label", "重新解析号码 " + record.number);

      var heading = document.createElement("span");
      heading.className = "history-item__heading";

      var number = document.createElement("strong");
      number.className = "history-item__number";
      number.textContent = record.number;
      number.title = record.number;

      var format = document.createElement("span");
      format.className = "history-item__format";
      format.textContent = record.format + " 位";
      heading.append(number, format);

      var details = document.createElement("span");
      details.className = "history-item__details";
      details.textContent = record.region + " · " + record.gender + " · " + record.birthDate;

      openButton.append(heading, details);

      var actions = document.createElement("span");
      actions.className = "history-item__actions";

      var copyButton = document.createElement("button");
      copyButton.className = "history-item__action history-item__copy";
      copyButton.type = "button";
      copyButton.dataset.historyCopy = record.number;
      copyButton.setAttribute("aria-label", "复制号码 " + record.number);
      copyButton.title = "复制号码";
      var copyIcon = document.createElement("span");
      copyIcon.className = "history-copy-icon";
      copyIcon.setAttribute("aria-hidden", "true");
      copyButton.appendChild(copyIcon);

      var deleteButton = document.createElement("button");
      deleteButton.className = "history-item__action history-item__delete";
      deleteButton.type = "button";
      deleteButton.dataset.historyDelete = record.number;
      deleteButton.setAttribute("aria-label", "删除号码 " + record.number + " 的历史记录");
      deleteButton.title = "删除记录";
      var deleteIcon = document.createElement("span");
      deleteIcon.className = "history-delete-icon";
      deleteIcon.setAttribute("aria-hidden", "true");
      deleteIcon.textContent = "×";
      deleteButton.appendChild(deleteIcon);

      actions.append(copyButton, deleteButton);
      item.append(openButton, actions);
      fragment.appendChild(item);
    });
    historyList.appendChild(fragment);
    if (!isHistoryExpanded) window.requestAnimationFrame(fitCompactHistoryItems);
  }

  // 收起状态按实际可用宽度显示尽可能多的记录，剩余记录通过详情展开。
  function fitCompactHistoryItems() {
    if (isHistoryExpanded || historyRecords.length === 0) return;

    var items = Array.prototype.slice.call(historyList.children);
    items.forEach(function (item) {
      item.hidden = false;
    });

    if (historyMobileQuery.matches) {
      historyToggleButton.hidden = false;
      historyToggleButton.textContent = "查看历史记录";
      return;
    }

    var availableWidth = historyList.clientWidth;
    if (availableWidth <= 0) return;
    var listStyle = window.getComputedStyle(historyList);
    var gap = parseFloat(listStyle.columnGap || listStyle.gap) || 0;
    var usedWidth = 0;
    var visibleCount = 0;

    items.forEach(function (item) {
      var itemWidth = Math.ceil(item.getBoundingClientRect().width);
      var nextWidth = usedWidth + (visibleCount ? gap : 0) + itemWidth;
      if (nextWidth <= availableWidth || visibleCount === 0) {
        usedWidth = nextWidth;
        visibleCount += 1;
      } else {
        item.hidden = true;
      }
    });

    historyToggleButton.hidden = false;
    historyToggleButton.textContent =
      visibleCount < historyRecords.length ? "查看更多" : "查看详情";
  }

  // 相同号码重新解析时移到最前方，不重复占用历史条目。
  function addHistoryRecord(number, result) {
    historyRecords = historyRecords.filter(function (record) {
      return record.number !== number;
    });
    historyRecords.unshift({
      number: number,
      format: result.format,
      region: result.region.fullName,
      gender: result.gender,
      birthDate: result.birthDate.iso,
      createdAt: Date.now()
    });
    historyRecords = historyRecords.slice(0, HISTORY_LIMIT);
    persistHistory();
    renderHistory();
  }

  // 只有 15 位或 18 位时才允许提交，复制与清空按钮也在这里同步状态。
  function updateInputState() {
    var length = input.value.trim().length;
    var canParse = length === 15 || length === 18;
    charCount.textContent = length + " / 18";
    charCount.classList.toggle("is-over-limit", length > 18);
    parseButton.disabled = !canParse;
    parseButton.setAttribute(
      "aria-label",
      canParse ? "开始解析身份证号码" : "请输入 15 位或 18 位身份证号码后再解析"
    );
    inputCopyButton.hidden = length === 0;
    inputClearButton.hidden = input.value.length === 0;
    inputCopyButton.classList.remove("is-copied");
    inputCopyButton.setAttribute("aria-label", "复制输入的身份证号码");
    inputCopyButton.title = "复制输入内容";
  }

  function getStatusSymbol(status) {
    if (status === "pass") return "✓";
    if (status === "fail") return "×";
    if (status === "info") return "i";
    return "–";
  }

  // 出生日期扩展信息由浏览器原生 Intl API 计算，不依赖网络或第三方库。
  function createDateFromIso(iso) {
    var parts = String(iso || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }

  function getLunarDayName(day) {
    var digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    if (day <= 0 || day > 30) return String(day);
    if (day < 10) return "初" + digits[day];
    if (day === 10) return "初十";
    if (day < 20) return "十" + digits[day - 10];
    if (day === 20) return "二十";
    if (day < 30) return "廿" + digits[day - 20];
    return "三十";
  }

  function formatLunarDate(date) {
    try {
      var lunar = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
        year: "numeric",
        month: "long",
        day: "numeric"
      }).format(date);
      return lunar
        .replace(/^\d{4}/, "")
        .replace(/(\d+)日?$/, function (_, day) {
          return getLunarDayName(Number(day));
        });
    } catch (error) {
      return "当前浏览器不支持农历换算";
    }
  }

  function getConstellationName(month, day) {
    var boundary = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
    var names = [
      "摩羯座",
      "水瓶座",
      "双鱼座",
      "白羊座",
      "金牛座",
      "双子座",
      "巨蟹座",
      "狮子座",
      "处女座",
      "天秤座",
      "天蝎座",
      "射手座",
      "摩羯座"
    ];
    return day < boundary[month - 1] ? names[month - 1] : names[month];
  }

  function formatBirthDateExtras(iso) {
    var date = createDateFromIso(iso);
    if (!date) return "";
    var weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    return (
      "农历 " +
      formatLunarDate(date) +
      " · " +
      weekdays[date.getDay()] +
      " · " +
      getConstellationName(date.getMonth() + 1, date.getDate())
    );
  }

  // 把解析核心返回的 checks 数据模型转换为可访问的规则检查列表。
  function renderChecks(result) {
    checksList.replaceChildren();
    result.checks.forEach(function (check) {
      var item = document.createElement("li");
      item.className = "check-item check-item--" + check.status;

      var icon = document.createElement("span");
      icon.className = "check-item__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = getStatusSymbol(check.status);

      var content = document.createElement("div");
      content.className = "check-item__content";
      var label = document.createElement("strong");
      var detail = document.createElement("p");
      label.textContent = check.label;
      detail.textContent = check.detail;

      if (check.key === "birthDate" && result.birthDate) {
        detail.textContent += " · " + formatBirthDateExtras(result.birthDate.iso);
      }

      content.append(label, detail);
      item.append(icon, content);
      checksList.appendChild(item);
    });

    var passedCount = result.checks.filter(function (check) {
      return check.status === "pass";
    }).length;
    var failedCount = result.checks.filter(function (check) {
      return check.status === "fail";
    }).length;
    var infoCount = result.checks.filter(function (check) {
      return check.status === "info";
    }).length;

    if (failedCount > 0) {
      checkSummary.textContent = passedCount + " / " + result.checks.length + " 项通过";
    } else if (infoCount > 0) {
      checkSummary.textContent = passedCount + " 项通过 · " + infoCount + " 项说明";
    } else {
      checkSummary.textContent = passedCount + " / " + result.checks.length + " 项通过";
    }
  }

  // 根据通过、失败或旧版格式设置统一的顶部状态提示。
  function renderStatus(result) {
    statusBanner.className = "status-banner";
    statusIcon.textContent = result.valid ? "✓" : "×";

    if (!result.valid) {
      statusBanner.classList.add("status-banner--error");
      statusKicker.textContent = "VALIDATION FAILED";
      statusTitle.textContent = "号码不合规";
      statusDescription.textContent = result.errors[0] || "请检查号码后重试。";
      return;
    }

    if (result.format === "15") {
      statusBanner.classList.add("status-banner--legacy");
      statusKicker.textContent = "LEGACY FORMAT PASSED";
      statusTitle.textContent = "旧版格式校验通过";
      statusDescription.textContent = "地区、出生日期与顺序码均符合旧版结构，可按需转换为 18 位号码。";
      return;
    }

    statusBanner.classList.add("status-banner--success");
    statusKicker.textContent = "VALIDATION PASSED";
    statusTitle.textContent = "号码校验通过";
    statusDescription.textContent = "号码结构、行政区划、日期、顺序码和校验位均符合规则。";
  }

  function renderWarnings(result) {
    if (!result.warnings.length) {
      warningBox.hidden = true;
      warningText.textContent = "";
      return;
    }
    warningBox.hidden = false;
    warningTitle.textContent =
      result.region && result.region.historical ? "历史区划提示" : "旧号码提示";
    warningText.textContent = result.warnings.join(" ");
  }

  // 合法号码才展示地区、性别、出生日期、地图入口和可用的转换操作。
  function renderDetails(result) {
    pendingConversion = null;
    convertedNumber = "";
    conversionEntry.hidden = true;
    conversionResultCard.hidden = true;
    conversionRunButton.hidden = true;
    conversionCopyButton.hidden = true;
    detailsSection.hidden = !result.valid;
    if (!result.valid) return;

    formatChip.textContent = result.format === "15" ? "15 位旧号码" : "18 位号码";
    resultRegion.textContent = result.region.fullName;
    resultRegionCode.textContent =
      "地址码 " + result.region.code + (result.region.historical ? " · 历史代码" : " · 在用代码");
    var mapKeyword = [result.region.province, result.region.city, result.region.county]
      .filter(function (part, index, parts) {
        return part && parts.indexOf(part) === index;
      })
      .join("");
    regionMapLink.href =
      "https://uri.amap.com/search?keyword=" +
      encodeURIComponent(mapKeyword) +
      "&view=map&src=identity-number-parser&callnative=0";
    regionMapLink.setAttribute("aria-label", "在高德地图中查看" + result.region.fullName);
    resultGender.textContent = result.gender;
    resultBirth.textContent = result.birthDate.formatted;
    resultBirthExtras.textContent = formatBirthDateExtras(result.birthDate.iso);
    var conversion = result.conversion;
    pendingConversion = conversion;
    convertedNumber = "";
    conversionResultLabel.textContent =
      conversion.sourceFormat + " 位转 " + conversion.targetFormat + " 位";

    if (conversion.possible) {
      conversionEntry.hidden = false;
      conversionRunButton.hidden = false;
      conversionEntryLabel.textContent = "转换为 " + conversion.targetFormat + " 位";
      conversionCopyButton.hidden = true;
      conversionCopyButton.textContent = "复制结果";
    }
  }

  // 汇总所有结果区域，并用两帧切换触发入场动画。
  function render(result) {
    renderStatus(result);
    renderWarnings(result);
    renderDetails(result);
    renderChecks(result);
    resultPanel.hidden = false;
    window.requestAnimationFrame(function () {
      resultPanel.classList.remove("is-visible");
      window.requestAnimationFrame(function () {
        resultPanel.classList.add("is-visible");
      });
    });
  }

  function parseAndRender(value, saveToHistory) {
    var normalizedInput = String(value == null ? "" : value).trim().toUpperCase();
    var result = window.IdCardParser.parse(normalizedInput);
    render(result);
    if (saveToHistory && result.valid) addHistoryRecord(normalizedInput, result);
    return result;
  }

  function clearResults() {
    resultPanel.hidden = true;
    resultPanel.classList.remove("is-visible");
    warningBox.hidden = true;
    detailsSection.hidden = true;
    regionMapLink.removeAttribute("href");
    checksList.replaceChildren();
    convertedNumber = "";
    pendingConversion = null;
    conversionEntry.hidden = true;
    conversionResultCard.hidden = true;
    conversionRunButton.hidden = true;
    conversionCopyButton.hidden = true;
    conversionCopyButton.textContent = "复制结果";
  }

  // file:// 页面通常不属于安全上下文，因此保留 execCommand 复制降级方案。
  function fallbackCopy(text) {
    var temporary = document.createElement("textarea");
    temporary.value = text;
    temporary.setAttribute("readonly", "");
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.appendChild(temporary);
    temporary.select();
    var copied = document.execCommand("copy");
    temporary.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error("copy failedCount"));
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return fallbackCopy(text);
  }

  // 所有输入方式统一清洗：仅保留数字和 X，转为大写并限制为 18 位。
  // 根据清洗前的前缀重新计算光标，避免在中间编辑时跳到末尾。
  input.addEventListener("input", function () {
    var original = input.value;
    var caret = input.selectionStart == null ? original.length : input.selectionStart;
    var sanitized = original.toUpperCase().replace(/[^0-9X]/g, "").slice(0, 18);

    if (original !== sanitized) {
      var sanitizedCaret = original
        .slice(0, caret)
        .toUpperCase()
        .replace(/[^0-9X]/g, "")
        .slice(0, 18).length;
      input.value = sanitized;
      input.setSelectionRange(sanitizedCaret, sanitizedCaret);
    }
    updateInputState();
  });

  input.addEventListener("paste", function () {
    window.setTimeout(updateInputState, 0);
  });

  inputClearButton.addEventListener("click", function () {
    input.value = "";
    updateInputState();
    clearResults();
    input.focus();
  });

  inputCopyButton.addEventListener("click", function () {
    var value = input.value.trim();
    if (!value) return;

    copyText(value)
      .then(function () {
        window.clearTimeout(inputCopyTimeoutId);
        inputCopyButton.classList.add("is-copied");
        inputCopyButton.setAttribute("aria-label", "输入内容已复制");
        inputCopyButton.title = "已复制";
        inputCopyTimeoutId = window.setTimeout(function () {
          inputCopyButton.classList.remove("is-copied");
          inputCopyButton.setAttribute("aria-label", "复制输入的身份证号码");
          inputCopyButton.title = "复制输入内容";
        }, 1600);
      })
      .catch(function () {
        inputCopyButton.title = "复制失败";
      });
  });

  // 号码转换默认不展示结果，只有用户主动点击后才展开。
  conversionRunButton.addEventListener("click", function () {
    if (!pendingConversion || !pendingConversion.possible) return;
    convertedNumber = pendingConversion.value;
    conversionEntry.hidden = true;
    conversionResultCard.hidden = false;
    conversionResultNumber.textContent = pendingConversion.value;
    conversionResultNote.textContent = pendingConversion.note;
    conversionRunButton.hidden = true;
    conversionCopyButton.hidden = false;
    conversionCopyButton.textContent = "复制结果";
  });

  conversionCopyButton.addEventListener("click", function () {
    if (!convertedNumber) return;
    copyText(convertedNumber)
      .then(function () {
        conversionCopyButton.textContent = "已复制";
        window.setTimeout(function () {
          conversionCopyButton.textContent = "复制结果";
        }, 1600);
      })
      .catch(function () {
        conversionCopyButton.textContent = "复制失败";
      });
  });

  // 历史列表使用事件委托，统一处理复制、删除与重新解析三类动作。
  historyList.addEventListener("click", function (event) {
    var copyButton = event.target.closest("[data-history-copy]");
    if (copyButton) {
      var numberToCopy = copyButton.dataset.historyCopy;
      copyText(numberToCopy)
        .then(function () {
          copyButton.classList.add("is-copied");
          copyButton.setAttribute("aria-label", "号码已复制");
          copyButton.title = "已复制";
          window.setTimeout(function () {
            copyButton.classList.remove("is-copied");
            copyButton.setAttribute("aria-label", "复制号码 " + numberToCopy);
            copyButton.title = "复制号码";
          }, 1600);
        })
        .catch(function () {
          copyButton.title = "复制失败";
        });
      return;
    }

    var deleteButton = event.target.closest("[data-history-delete]");
    if (deleteButton) {
      var numberToDelete = deleteButton.dataset.historyDelete;
      historyRecords = historyRecords.filter(function (record) {
        return record.number !== numberToDelete;
      });
      if (historyRecords.length === 0) isHistoryExpanded = false;
      persistHistory();
      renderHistory();
      return;
    }

    var historyButton = event.target.closest("[data-history-number]");
    if (!historyButton) return;
    input.value = historyButton.dataset.historyNumber;
    updateInputState();
    parseAndRender(input.value, true);
    var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultPanel.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  });

  historyToggleButton.addEventListener("click", function () {
    isHistoryExpanded = !isHistoryExpanded;
    renderHistory();
  });

  historyClearButton.addEventListener("click", function () {
    historyRecords = [];
    isHistoryExpanded = false;
    persistHistory();
    renderHistory();
  });

  // 提交层再次检查长度，防止脚本触发绕过按钮的 disabled 状态。
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var length = input.value.trim().length;
    if (length !== 15 && length !== 18) return;
    parseAndRender(input.value, true);
  });

  form.addEventListener("reset", function () {
    window.setTimeout(function () {
      updateInputState();
      clearResults();
      input.focus();
    }, 0);
  });

  resetButton.addEventListener("click", clearResults);

  // 宽度变化后重新计算紧凑历史的可见条数，并同步移动端展开状态。
  if ("ResizeObserver" in window) {
    new ResizeObserver(function () {
      fitCompactHistoryItems();
    }).observe(historyList);
  } else {
    window.addEventListener("resize", fitCompactHistoryItems);
  }
  var handleHistoryBreakpointChange = function (event) {
    if (event.matches) isHistoryExpanded = false;
    renderHistory();
  };
  if (historyMobileQuery.addEventListener) {
    historyMobileQuery.addEventListener("change", handleHistoryBreakpointChange);
  } else {
    historyMobileQuery.addListener(handleHistoryBreakpointChange);
  }
  renderHistory();
  updateInputState();
})();
