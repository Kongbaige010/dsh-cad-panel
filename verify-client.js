// 离线模拟 DSH 客户端模块加载：验证 exports / 槽位注册 / 右侧栏开关切换。
const path = require("node:path");

const PACKAGE = path.join(
  process.env.USERPROFILE,
  ".dsh",
  "local-plugins",
  "dsh-cad-panel",
  "lib",
  "client.js",
);

const registrations = [];
const tabTypes = [];
const opened = [];
const closed = [];
let openTabs = [];
let loaded = null;

// 极简 React 替身：只需要 createElement / useState / useEffect / Fragment
function makeReact() {
  const states = [];
  let cursor = 0;
  return {
    Fragment: "Fragment",
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => {
      const index = cursor++;
      if (states[index] === undefined) {
        states[index] = typeof initial === "function" ? initial() : initial;
      }
      const set = (next) => {
        states[index] = next;
      };
      return [states[index], set];
    },
    useEffect: () => {},
    __resetCursor: () => {
      cursor = 0;
    },
  };
}

const React = makeReact();

globalThis.window = {
  __ModuleLoader__: {
    load: (mod) => {
      loaded = mod;
    },
  },
  location: { origin: "dsh-app://app" },
};
/* fetch 由各用例设置 payload；轮询回调被收集起来由测试手动触发 */
let currentPayload = null;
const intervals = [];
globalThis.fetch = () =>
  Promise.resolve({ ok: currentPayload !== null, json: () => Promise.resolve(currentPayload) });
globalThis.setInterval = (fn) => {
  intervals.push(fn);
  return intervals.length;
};
globalThis.clearInterval = () => {};

const fakeCtx = {
  /* 右侧栏控制器（官方浏览器同款通道） */
  sidebarRight: {
    commandTarget: () => ({ sessionId: "s1", paneId: "p1" }),
    openTabFromTarget: (kind, target) => {
      opened.push({ kind, via: "openTabFromTarget", target });
      openTabs = [{ sessionId: "s1", tabId: "t1", kind, contentId: kind }];
    },
    openTab: (kind, options) => {
      opened.push({ kind, via: "openTab", options });
      openTabs = [{ sessionId: "s1", tabId: "t1", kind, contentId: kind }];
    },
    closeIn: (sessionId, tabId) => {
      closed.push({ sessionId, tabId });
      openTabs = openTabs.filter((tab) => tab.tabId !== tabId);
    },
    openTabs: {
      getSnapshot: () => openTabs,
    },
  },
  /* 右侧栏标签类型注册表 */
  sidebarRightTabs: {
    register: (definition) => {
      tabTypes.push(definition);
    },
  },
  slots: {
    inject: (name, factory) => {
      const result = factory();
      registrations.push({ slot: name, face: result });
    },
    register: (face, Component) => ({ face, Component }),
  },
};

const originalRequire = require;
const loaderRequire = (id) => {
  if (id === "react") return React;
  return originalRequire(id);
};

require(PACKAGE);
if (!loaded) {
  console.error("RESULT: 模块未通过 __ModuleLoader__ 加载");
  process.exit(1);
}

const mod = loaded.factory(loaderRequire);
console.log("inject 声明:", JSON.stringify(mod.inject));
const badInjects = (mod.inject || []).filter((name) => name !== "slots");
if (badInjects.length) {
  console.error("RESULT: inject 含未知服务", badInjects);
  process.exit(1);
}

mod.apply(fakeCtx);

let failures = 0;

console.log("注册数量:", registrations.length);
for (const item of registrations) {
  const face = item.face && item.face.face ? item.face.face : item.face;
  console.log(" -", item.slot, "->", JSON.stringify(face));
  try {
    const rendered = item.face.Component({ onClose: () => {} });
    if (!rendered || (!rendered.type && !rendered.props)) throw new Error("渲染结果为空");
  } catch (error) {
    failures += 1;
    console.error("   组件渲染失败:", error.message);
  }
}

/* 标签类型必须注册，且内容槽位的 key 要对得上 id 或 kind */
console.log("标签类型:", JSON.stringify(tabTypes));
if (tabTypes.length !== 1) {
  failures += 1;
  console.error("   右侧栏标签类型注册数量应为 1，实际", tabTypes.length);
} else {
  const def = tabTypes[0];
  if (!def.id || !def.kind) {
    failures += 1;
    console.error("   标签类型缺少 id 或 kind");
  }
  const bodyKeys = registrations
    .filter((item) => item.slot === "sidebar.right.pane.tab")
    .map((item) => (item.face && item.face.face ? item.face.face.key : undefined));
  console.log("内容槽位 key:", JSON.stringify(bodyKeys));
  if (!bodyKeys.includes(def.id) && !bodyKeys.includes(def.kind)) {
    failures += 1;
    console.error("   内容槽位 key 既不等于 id 也不等于 kind:", bodyKeys);
  }
  if (!registrations.some((item) => item.slot === "sidebar.right.pane.tab.title")) {
    failures += 1;
    console.error("   缺少标题槽位");
  }
}

/* 点一次开、再点一次关 */
const pill = registrations.find((item) => item.slot === "conversation.input.left");
if (!pill) {
  failures += 1;
  console.error("   缺少胶囊槽位");
} else {
  const click = () => {
    React.__resetCursor();
    let tree = pill.face.Component({});
    /* 槽位组件是包装层，展开到真正渲染的按钮 */
    let guard = 0;
    while (tree && typeof tree.type === "function" && guard++ < 5) {
      tree = tree.type(tree.props);
    }
    const button = [].concat(tree.children || []).filter(Boolean)[0];
    if (!button || !button.props || typeof button.props.onClick !== "function") {
      throw new Error("胶囊里找不到 onClick");
    }
    button.props.onClick();
  };
  try {
    click();
    if (opened.length !== 1) {
      failures += 1;
      console.error("   第一次点击应打开，实际 opened=", opened.length);
    }
    click();
    if (closed.length !== 1) {
      failures += 1;
      console.error("   第二次点击应关闭，实际 closed=", closed.length);
    }
    if (openTabs.length !== 0) {
      failures += 1;
      console.error("   关闭后仍有标签残留:", JSON.stringify(openTabs));
    }
    console.log("打开次数:", opened.length, "关闭次数:", closed.length);
  } catch (error) {
    failures += 1;
    console.error("   切换测试失败:", error.message);
  }
}

/* 构建监视器：首次只记基线，时间戳变化才打开右侧栏 */
(async () => {
  const tick = async () => {
    const fn = intervals[intervals.length - 1];
    if (typeof fn !== "function") throw new Error("没有注册轮询回调");
    fn();
    /* 等三轮微任务，让 fetch 链跑完 */
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  };

  if (intervals.length === 0) {
    failures += 1;
    console.error("   没有注册构建监视器");
  } else {
    const before = opened.length;
    currentPayload = { id: "doc1", built: 100 };
    await tick();
    if (opened.length !== before) {
      failures += 1;
      console.error("   首次轮询不应打开（应只记基线）");
    }

    currentPayload = { id: "doc1", built: 100 };
    await tick();
    if (opened.length !== before) {
      failures += 1;
      console.error("   时间戳没变时不该打开");
    }

    currentPayload = { id: "doc1", built: 200 };
    await tick();
    if (opened.length !== before + 1) {
      failures += 1;
      console.error("   构建发生后应自动打开，实际 opened=", opened.length - before);
    }
    console.log("构建触发：基线静默 / 未变静默 / 变化后打开 —— 通过");
  }

  console.log(failures === 0 ? "RESULT: ALL CHECKS PASSED" : "RESULT: FAILED");
  process.exit(failures === 0 ? 0 : 1);
})();
