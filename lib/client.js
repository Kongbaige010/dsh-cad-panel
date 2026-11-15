/**
 * dsh-cad-panel — client half.
 *
 * 在作曲栏左下加一个 "CAD" 按钮，点开是一个浮层面板，里面 iframe 嵌着
 * text-to-cad 的 viewer 页面（自带模型列表、旋转、缩放、实时跟随重建）。
 *
 * 为什么用 iframe 而不是原生 3D：
 *   viewer 的页面头是 `content-security-policy: frame-ancestors`，
 *   默认只允许它自己那个源嵌入。要让 DSH（127.0.0.1:51890）能嵌，
 *   已在引擎侧放开白名单（http_app.py 的 PAGE_HEADERS）。
 *   引擎升级后这一行会被覆盖 → 面板变空白，重打一次即可。
 *
 * 三条纪律（与出厂客户端插件一致）：
 *   1. 绝不破坏作曲栏：任何异常都 fail-open，按钮不出现而已，其余不受影响。
 *   2. 绝不说谎：地址或 token 失效时面板里显示的是引擎的真实回答，不做美化。
 *   3. 颜色只用主题 token（--dsw-*），明暗主题都能看。
 */
window.__ModuleLoader__.load({
  id: "dsh-cad-panel",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");

    var PACKAGE_ID = "dsh-cad-panel";
    var SLOT_NAME = "conversation.input.left";
    var ENTRY_ID = "cad-panel-toggle";
    var ENTRY_ORDER = 26;
    var LABEL = "CAD";
    /* 右侧栏标签类型的 id：标签内容的槽位 key 必须与它一致，否则标签打开是空的 */
    var PANEL_ID = "dsh-cad-panel-cad";
    /* 标签种类短名（官方浏览器是 "browser"）：openTab 用它 */
    var TAB_KIND = "cad";
    /* apply 拿到的宿主 ctx，供按钮点击时调用右侧栏服务 */
    var hostCtx = null;
    /* 构建监视器的基线时间戳与计时器 */
    var lastStamp = null;
    var buildWatch = null;
    var STYLE_ID = PACKAGE_ID + "-styles";

    /* ---- 唯一的两个可变项：引擎地址与页面 token ----------------------------
     * token 就是 `cad run` 打印的那条 `view:` 链接里的 token（安装级，不随模型变）。
     * 换了引擎端口或轮换了 token，改这两行 + 刷新页面即可，不需要重启 DSH。
     */
    /* 直连引擎，并且**不带 token**：
     * 引擎侧打了"授权记忆"补丁（任一请求带对 token 后 12 小时内同机放行），
     * 而宿主半边（lib/index.js）在 DSH 启动时和每 5 分钟用持久 token 去"开门"。
     * 所以客户端既不需要 token（它每次重启都会变），也不需要 Cookie 和反向代理。 */
    var ENGINE_URL = "http://127.0.0.1:3245";

    var inject = ["slots"];

    var CSS = [
      ".dcad-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;",
      "border:1px solid var(--dsw-alias-border-secondary);border-radius:999px;background:transparent;",
      "color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;",
      "letter-spacing:.02em;cursor:pointer;white-space:nowrap;user-select:none;",
      "transition:color .14s ease,border-color .14s ease}",
      ".dcad-pill:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-primary)}",
      ".dcad-pill[data-open='1']{color:var(--dsw-alias-brand-primary);",
      "border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent)}",
      ".dcad-pill:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);",
      "outline-offset:1px}",

      ".dcad-panel{position:fixed;right:20px;bottom:88px;width:min(78vw,1000px);height:min(72vh,760px);",
      "display:flex;flex-direction:column;z-index:9000;overflow:hidden;",
      "background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary);",
      "border:1px solid var(--dsw-alias-border-secondary);border-radius:12px;",
      "box-shadow:0 18px 48px rgba(0,0,0,.28)}",

      ".dcad-head{display:flex;align-items:center;gap:10px;padding:6px 8px 6px 12px;",
      "border-bottom:1px solid var(--dsw-alias-border-secondary);flex:none}",
      ".dcad-title{font-size:12px;letter-spacing:.04em;text-transform:uppercase;",
      "color:var(--dsw-alias-label-secondary)}",
      ".dcad-spacer{flex:1}",
      ".dcad-link{font-size:12px;color:var(--dsw-alias-label-secondary);text-decoration:none}",
      ".dcad-link:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}",
      ".dcad-close{width:24px;height:24px;border:none;border-radius:6px;background:transparent;",
      "color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:15px;line-height:1}",
      ".dcad-close:hover{background:var(--dsw-alias-bg-hover,transparent);color:var(--dsw-alias-label-primary)}",

      ".dcad-frame{flex:1;width:100%;border:none;background:#f6f7f9}",
      /* 侧栏页：整个主区交给 viewer */
      ".dcad-page{display:flex;flex-direction:column;flex:1;width:100%;height:100%;min-height:0}",
      ".dcad-pageframe{flex:1;width:100%;height:100%;border:none;background:#f6f7f9}",
      /* 右侧栏打不开时的提示条：贴着输入框上方，不挡内容 */
      ".dcad-problem{position:fixed;left:50%;transform:translateX(-50%);bottom:96px;z-index:60;display:flex;align-items:center;gap:8px;max-width:70vw;padding:8px 12px;border-radius:10px;background:#7f1d1d;color:#fff;font:12px/1.5 ui-sans-serif,system-ui;box-shadow:0 8px 24px rgba(0,0,0,.28)}",
      ".dcad-problem-x{border:none;background:transparent;color:#fff;font-size:14px;cursor:pointer;line-height:1;padding:0 2px}",
      ".dcad-split{flex:1;display:flex;flex-direction:column;min-height:0}",
      ".dcad-cell{flex:1;display:flex;flex-direction:column;min-height:0}",
      ".dcad-cell+.dcad-cell{border-top:2px solid var(--dsw-alias-border-secondary)}",
      ".dcad-tag{flex:none;font-size:11px;padding:2px 8px;letter-spacing:.02em;",
      "color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-hover,transparent)}",
      ".dcad-frame-dark{background:#1b1d22}",
    ];

    function ensureStyles() {
      try {
        if (document.getElementById(STYLE_ID)) return;
        var el = document.createElement("style");
        el.id = STYLE_ID;
        el.textContent = CSS.join("");
        document.head.appendChild(el);
      } catch (error) {
        /* a missing stylesheet only costs looks */
      }
    }

    function viewerUrl(doc) {
      return doc ? ENGINE_URL + "/" + encodeURIComponent(doc) : ENGINE_URL + "/";
    }

    /* 跟随"当前模型"：引擎的 /dsh/current 返回最新文档 id（带 CORS，面板可读）。
     * 每 5 秒问一次，模型重建后 id 变了面板就自动换页 —— 这就是"实时"。 */
    function useCurrentDoc() {
      var pair = React.useState(null);
      var doc = pair[0];
      var setDoc = pair[1];
      React.useEffect(function () {
        var stopped = false;
        function pull() {
          fetch(ENGINE_URL + "/dsh/current", { cache: "no-store" })
            .then(function (response) {
              return response.ok ? response.json() : null;
            })
            .then(function (data) {
              if (!stopped && data && data.id) setDoc(data.id);
            })
            .catch(function () {
              /* 引擎没起：保持现状，下次再试 */
            });
        }
        pull();
        var timer = setInterval(pull, 5000);
        return function () {
          stopped = true;
          clearInterval(timer);
        };
      }, []);
      return doc;
    }

    function CadPanel(props) {
      var doc = useCurrentDoc();
      return React.createElement(
        "div",
        { className: "dcad-panel", role: "dialog", "aria-label": "CAD Viewer" },
        React.createElement(
          "div",
          { className: "dcad-head" },
          React.createElement("span", { className: "dcad-title" }, "CAD Viewer"),
          React.createElement("span", { className: "dcad-spacer" }),
          React.createElement(
            "a",
            { className: "dcad-link", href: viewerUrl(doc), target: "_blank", rel: "noreferrer" },
            "新窗口打开",
          ),
          React.createElement(
            "button",
            { className: "dcad-close", type: "button", onClick: props.onClose, title: "关闭" },
            "\u00d7",
          ),
        ),
        React.createElement(
          "div",
          { className: "dcad-split" },
          React.createElement(
            "div",
            { className: "dcad-cell" },
            React.createElement("iframe", {
              className: "dcad-frame",
              src: viewerUrl(doc),
              title: "text-to-cad viewer",
              allow: "fullscreen",
            }),
          ),
        ),
      );
    }

    /* 侧栏条目图标：16×16 立方体轮廓，线条与侧栏其他图标一致 */
    function CadIcon() {
      return React.createElement(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
        React.createElement("path", {
          d: "M8 1.7 14 5.1v5.8L8 14.3 2 10.9V5.1L8 1.7Z",
          stroke: "currentColor",
          strokeWidth: 1.15,
          strokeLinejoin: "round",
        }),
        React.createElement("path", {
          d: "M2.2 5.2 8 8.6l5.8-3.4M8 8.6v5.6",
          stroke: "currentColor",
          strokeWidth: 1.15,
          strokeLinejoin: "round",
        }),
      );
    }

    /* 侧栏页本体：占满主区，自动跟随当前模型 */
    function CadPage() {
      ensureStyles();
      var doc = useCurrentDoc();
      return React.createElement(
        "div",
        { className: "dcad-page" },
        React.createElement("iframe", {
          className: "dcad-pageframe",
          src: viewerUrl(doc),
          title: "text-to-cad viewer",
          allow: "fullscreen",
        }),
      );
    }

    function CadTabBody() {
      ensureStyles();
      return React.createElement(CadPage);
    }

    function CadTabTitle() {
      return React.createElement("span", null, LABEL);
    }

    /* 打开右侧栏里的 CAD 标签。官方"浏览器"用的就是这条通道：
     * commandTarget(元素) 找到当前会话的停靠目标，openTabFromTarget(kind, 目标) 开标签。
     * 拿不到目标时退一级用 openTab(kind)。返回回执，便于在界面上显示为什么失败。 */
    function openCadTab() {
      var right = hostCtx && hostCtx.sidebarRight;
      if (!right) return { ok: false, message: "sidebarRight 服务不可用" };
      try {
        if (typeof right.commandTarget === "function" && typeof right.openTabFromTarget === "function") {
          var target = right.commandTarget(null);
          if (target) {
            right.openTabFromTarget(TAB_KIND, target);
            return { ok: true, message: "已打开（commandTarget）" };
          }
        }
        if (typeof right.openTab === "function") {
          right.openTab(TAB_KIND, {});
          return { ok: true, message: "已打开（openTab）" };
        }
      } catch (error) {
        return { ok: false, message: "打开失败：" + ((error && error.message) || String(error)) };
      }
      return { ok: false, message: "sidebarRight 没有可用的打开方法" };
    }

    /* 右侧栏里已经打开的 CAD 标签（快照字段：sessionId / tabId / kind / contentId） */
    function cadTabs() {
      var right = hostCtx && hostCtx.sidebarRight;
      var store = right && right.openTabs;
      var list = store && typeof store.getSnapshot === "function" ? store.getSnapshot() : null;
      if (!Array.isArray(list)) return [];
      return list.filter(function (tab) {
        return tab && (tab.kind === TAB_KIND || tab.contentId === PANEL_ID);
      });
    }

    /* 点一下开、再点一下关 */
    function toggleCadTab() {
      var right = hostCtx && hostCtx.sidebarRight;
      if (!right) return { ok: false, message: "sidebarRight 服务不可用" };
      try {
        var open = cadTabs();
        if (open.length) {
          if (typeof right.closeIn !== "function") return { ok: false, message: "没有关闭接口" };
          open.forEach(function (tab) {
            right.closeIn(tab.sessionId, tab.tabId);
          });
          return { ok: true, message: "已关闭", closed: true };
        }
      } catch (error) {
        return { ok: false, message: "关闭失败：" + ((error && error.message) || String(error)) };
      }
      return openCadTab();
    }

    function CadToggle() {
      ensureStyles();
      var state = React.useState(null);
      var problem = state[0];
      var setProblem = state[1];

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "button",
          {
            className: "dcad-pill",
            type: "button",
            "data-open": problem ? "1" : "0",
            title: "在右侧栏打开 / 关闭 CAD 查看器",
            onClick: function () {
              var result = toggleCadTab();
              setProblem(result.ok ? null : result.message);
            },
          },
          "CAD",
        ),
        problem
          ? React.createElement(
              "div",
              { className: "dcad-problem" },
              React.createElement("span", null, "右侧栏打不开：" + problem),
              React.createElement(
                "button",
                {
                  className: "dcad-problem-x",
                  type: "button",
                  onClick: function () {
                    setProblem(null);
                  },
                },
                "×",
              ),
            )
          : null,
      );
    }

    function apply(ctx) {
      try {
        ctx.slots.inject(SLOT_NAME, function () {
          return ctx.slots.register(
            {
              name: SLOT_NAME,
              id: ENTRY_ID,
              order: ENTRY_ORDER,
              label: function () {
                return LABEL;
              },
            },
            function SlotComponent(props) {
              return React.createElement(CadToggle, props);
            },
          );
        });
      } catch (error) {
        /* 注册失败只意味着按钮不出现；绝不打断作曲栏 */
        try {
          console.error("[" + PACKAGE_ID + "] registration failed:", error);
        } catch (ignored) {
          /* nothing to do */
        }
      }

      /* ── 右侧栏标签页（dock） ──────────────────────────────────────
       * 右侧栏是 dock，三步：
       *   ① sidebarRightTabs.register 声明一种标签（id / kind / 标题 / 开始页入口）
       *   ② sidebar.right.pane.tab 槽位渲染内容，key 对应标签
       *   ③ 打开：sidebarRight.commandTarget + openTabFromTarget（官方浏览器同款）
       * 内容槽位的 key 在版本间有"用 id"和"用 kind"两种，两个都注册一份，谁匹配谁生效。 */
      /* 右侧栏服务用可选注入拿作用域：服务在就启用，不在也不拖累插件激活 */
      function registerRightSidebar(scope) {
        hostCtx = scope;
        try {
          var tabs = scope.sidebarRightTabs;
          if (!tabs || typeof tabs.register !== "function") return;
          tabs.register({
            id: PANEL_ID,
            kind: TAB_KIND,
            multiple: false,
            title: function () {
              return LABEL;
            },
            guide: [
              {
                id: "open",
                order: 35,
                icon: CadIcon,
                title: function () {
                  return LABEL;
                },
                description: function () {
                  return "实时查看当前模型";
                },
              },
            ],
          });
        } catch (error) {
          try {
            console.error("[" + PACKAGE_ID + "] 右侧栏标签类型注册失败:", error);
          } catch (ignored) {
            /* nothing to do */
          }
        }
      }

      try {
        if (typeof ctx.inject === "function") {
          ctx.inject(["sidebarRight", "sidebarRightTabs"], registerRightSidebar);
        } else {
          registerRightSidebar(ctx);
        }
      } catch (error) {
        try {
          console.error("[" + PACKAGE_ID + "] 右侧栏服务注入失败:", error);
        } catch (ignored) {
          /* nothing to do */
        }
        registerRightSidebar(ctx);
      }

      [PANEL_ID, TAB_KIND].forEach(function (key) {
        try {
          ctx.slots.inject("sidebar.right.pane.tab", function () {
            return ctx.slots.register({ name: "sidebar.right.pane.tab", key: key }, CadTabBody);
          });
        } catch (error) {
          try {
            console.error("[" + PACKAGE_ID + "] sidebar.right.pane.tab 不可用:", error);
          } catch (ignored) {
            /* nothing to do */
          }
        }
        try {
          ctx.slots.inject("sidebar.right.pane.tab.title", function () {
            return ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: key }, CadTabTitle);
          });
        } catch (error) {
          try {
            console.error("[" + PACKAGE_ID + "] sidebar.right.pane.tab.title 不可用:", error);
          } catch (ignored) {
            /* nothing to do */
          }
        }
      });

      /* ── 只在"真的构建了模型"时自动打开右侧栏 ────────────────────────
       * 页面加载不弹。引擎每构建一次都会改写文档记录，/dsh/current 返回的
       * at 时间戳随之变化；轮询比对，变了才开，让执行 CAD 任务时可旁观进度。 */
      buildWatch = setInterval(function () {
        if (!(hostCtx && hostCtx.sidebarRight)) return;
        fetch(ENGINE_URL + "/dsh/current", { cache: "no-store" })
          .then(function (response) {
            return response.ok ? response.json() : null;
          })
          .then(function (data) {
            if (!data || !data.id) return;
            /* built 只在重建时变；记录里的 opened/preview 每次打开都会改写，不能用 */
            var stamp = data.id + "@" + (data.built === undefined ? "" : data.built);
            if (lastStamp === null) {
              lastStamp = stamp;   /* 首次只记基线：不因为"本来就有模型"而弹窗 */
              return;
            }
            if (stamp === lastStamp) return;
            lastStamp = stamp;
            /* 已经开着就只是"看",不再打扰一次聚焦动画 */
            if (cadTabs().length === 0) openCadTab();
          })
          .catch(function () {
            /* 引擎没起：下一轮再试 */
          });
      }, 4000);
    }

    exports.dispose = function () {
      if (buildWatch !== null) {
        clearInterval(buildWatch);
        buildWatch = null;
      }
    };

    exports.inject = inject;
    exports.apply = apply;
    return exports;
  },
});
