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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
let jsonConverterPanel;
function activate(context) {
    // 1. 注册「打开面板」核心命令
    const openPanelCmd = vscode.commands.registerCommand('json-converter.openPanel', () => {
        createOrShowJsonPanel(context);
    });
    // 2. 创建空的TreeDataProvider（仅占位，消除「无数据提供者」提示）
    const treeProvider = {
        getTreeItem: (item) => item,
        getChildren: () => Promise.resolve([]) // 返回空数组，隐藏冗余提示
    };
    // 3. 创建TreeView并监听「视图可见性变化」（点击图标触发）
    const treeView = vscode.window.createTreeView('json-converter-icon', {
        treeDataProvider: treeProvider,
        showCollapseAll: false
    });
    // 核心：视图从「隐藏→可见」时，自动执行打开面板命令
    treeView.onDidChangeVisibility((e) => {
        if (e.visible) {
            vscode.commands.executeCommand('json-converter.openPanel');
        }
    });
    // 4. 订阅资源（确保插件卸载时清理）
    context.subscriptions.push(openPanelCmd, treeView);
}
// 创建/显示JSON转换器面板（核心逻辑）
function createOrShowJsonPanel(context) {
    // 如果面板已存在，直接显示
    if (jsonConverterPanel) {
        jsonConverterPanel.reveal(vscode.ViewColumn.One);
        return;
    }
    // 创建新面板
    jsonConverterPanel = vscode.window.createWebviewPanel('jsonConverter', // 面板唯一标识
    'JSON转换器', // 面板标题
    vscode.ViewColumn.One, // 显示在第一列
    {
        enableScripts: true, // 允许Webview执行JS
        retainContextWhenHidden: true, // 隐藏时保留上下文
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
    });
    // 面板销毁时重置
    jsonConverterPanel.onDidDispose(() => {
        jsonConverterPanel = undefined;
    }, null, context.subscriptions);
    // 初始化历史记录
    const historyKey = 'jsonConverter.history';
    let historyRecords = context.globalState.get(historyKey) || [];
    // 保存历史记录方法
    const saveHistory = (content) => {
        const record = {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleString('zh-CN'),
            content: content,
            size: formatSize(content.length)
        };
        historyRecords.unshift(record);
        historyRecords = historyRecords.slice(0, 50); // 最多保留50条
        context.globalState.update(historyKey, historyRecords);
        jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({ cmd: 'updateHistory', data: historyRecords });
    };
    // 注入Webview HTML（包含所有UI和交互逻辑）
    jsonConverterPanel.webview.html = getWebviewHtml(historyRecords);
    // 监听Webview消息（处理格式化/压缩等操作）
    jsonConverterPanel.webview.onDidReceiveMessage((msg) => {
        try {
            switch (msg.cmd) {
                case 'format': {
                    const parsed = JSON.parse(msg.data);
                    const formatted = JSON.stringify(parsed, null, 2);
                    saveHistory(msg.data);
                    jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({
                        cmd: 'formatRes',
                        data: formatted,
                        tree: parsed
                    });
                    break;
                }
                case 'compress': {
                    const parsed = JSON.parse(msg.data);
                    const compressed = JSON.stringify(parsed);
                    saveHistory(msg.data);
                    jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({ cmd: 'compressRes', data: compressed });
                    break;
                }
                case 'unicode2cn': {
                    const res = unescape(msg.data.replace(/\\u/g, '%u'));
                    saveHistory(msg.data);
                    jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({ cmd: 'unicode2cnRes', data: res });
                    break;
                }
                case 'cn2unicode': {
                    const res = msg.data.split('').map((c) => {
                        const code = c.charCodeAt(0);
                        return code > 127 ? `\\u${code.toString(16).padStart(4, '0')}` : c;
                    }).join('');
                    saveHistory(msg.data);
                    jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({ cmd: 'cn2unicodeRes', data: res });
                    break;
                }
                case 'expandAll':
                    jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({ cmd: 'expandAll' });
                    break;
                case 'collapseAll':
                    jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({ cmd: 'collapseAll' });
                    break;
                case 'loadHistory': {
                    const record = historyRecords.find(r => r.id === msg.id);
                    jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({ cmd: 'loadHistoryRes', data: (record === null || record === void 0 ? void 0 : record.content) || '' });
                    break;
                }
                case 'clearHistory': {
                    historyRecords = [];
                    context.globalState.update(historyKey, []);
                    jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({ cmd: 'updateHistory', data: [] });
                    break;
                }
            }
        }
        catch (e) {
            jsonConverterPanel === null || jsonConverterPanel === void 0 ? void 0 : jsonConverterPanel.webview.postMessage({
                cmd: 'error',
                data: `操作失败：${e.message}`
            });
        }
    });
}
// 格式化文件大小
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
// 生成Webview HTML（完整UI）
function getWebviewHtml(initialHistory) {
    // 渲染历史记录HTML
    let historyHtml = initialHistory.length === 0
        ? '<div style="text-align:center; color:#999; padding:20px;">暂无历史记录</div>'
        : initialHistory.map(r => `
        <div class="history-item" data-id="${r.id}">
          <div class="history-time">${r.timestamp}</div>
          <div class="history-size">${r.size}</div>
        </div>
      `).join('');
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>JSON转换器</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: Consolas, Monaco, 'Courier New', monospace;
          display: flex; height: 100vh; background: #f5f5f5; overflow: hidden;
        }
        /* 历史记录面板 */
        .history-panel {
          width: 220px; background: #fff; border-right: 1px solid #e0e0e0;
          display: flex; flex-direction: column;
        }
        .history-header {
          padding: 12px 16px; background: #007acc; color: white; font-weight: bold;
          display: flex; justify-content: space-between; align-items: center;
        }
        .history-header button {
          background: transparent; border: none; color: white; cursor: pointer;
          font-size: 16px; padding: 4px; border-radius: 4px;
          transition: background 0.2s;
        }
        .history-header button:hover { background: rgba(255,255,255,0.2); }
        .history-list { flex: 1; overflow-y: auto; padding: 8px; }
        .history-item {
          padding: 8px 12px; margin-bottom: 4px; background: #f9f9f9;
          border-radius: 4px; cursor: pointer; border-left: 3px solid transparent;
          transition: all 0.2s;
        }
        .history-item:hover { background: #e8f0fe; border-left-color: #007acc; }
        .history-item.active { background: #e8f0fe; border-left-color: #007acc; }
        .history-time { font-size: 12px; color: #666; margin-bottom: 4px; }
        .history-size { font-size: 11px; color: #999; text-align: right; }
        
        /* 主内容区 */
        .main-content { flex: 1; display: flex; flex-direction: column; padding: 16px; }
        .toolbar {
          display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;
          padding: 8px; background: #fff; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .btn {
          padding: 6px 12px; background: #007acc; color: white; border: none;
          border-radius: 4px; cursor: pointer; font-size: 14px;
          transition: background 0.2s;
        }
        .btn:hover { background: #005f99; }
        .btn-success { background: #43a047; }
        .btn-success:hover { background: #2e7d32; }
        .btn-danger { background: #e53935; }
        .btn-danger:hover { background: #c62828; }
        
        /* 编辑器容器 */
        .container {
          display: flex;
          gap: 16px;
          flex: 1;
          overflow: hidden;
          width: 100%;
        }
        .editor-wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #fff;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
          min-width: 400px;
        }
        .editor-header {
          padding: 8px 16px; background: #007acc; color: white; font-size: 14px;
        }
        .tree-header { background: #43a047; }
        textarea {
          flex: 1; width: 100%; padding: 16px; border: none; resize: none;
          font-family: inherit; font-size: 14px; line-height: 1.5;
          background: #272822; color: #f8f8f2; outline: none;
        }
        .tree-container {
          flex: 1;
          padding: 16px;
          overflow: auto;
          background: #272822;
          color: #f8f8f2;
          font-family: inherit;
          white-space: nowrap;
        }
        #errorTip {
          color: #ff5252; margin-top: 8px; height: 20px; line-height: 20px;
          padding-left: 8px; font-size: 14px;
        }

        /* 树视图样式 */
        .tree-node { 
          padding: 2px 0; 
        }
        .tree-node__key { color: #f92672; margin-right: 4px; }
        .tree-node__string { color: #e6db74; }
        .tree-node__number { color: #66d9ef; }
        .tree-node__boolean { color: #ae81ff; }
        .tree-node__null { color: #888888; }
        .tree-toggle {
          background: transparent; border: none; color: #fff; cursor: pointer;
          font-size: 12px; margin-right: 4px; padding: 0; width: 16px; height: 16px;
          line-height: 16px;
        }
        /* 新增：长文本省略的view all样式 */
        .view-all-btn {
          color: #4CAF50;
          cursor: pointer;
          margin-left: 4px;
          font-size: 12px;
          text-decoration: underline;
        }
        .view-all-btn:hover {
          color: #81C784;
        }
        /* 新增：完整内容弹窗样式 */
        .full-content-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: #1E1E1E;
          color: #fff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          z-index: 1000;
          max-width: 80%;
          max-height: 80%;
          overflow: auto;
        }
        .modal-close {
          position: absolute;
          top: 10px;
          right: 15px;
          cursor: pointer;
          font-size: 20px;
          color: #aaa;
        }
        .modal-close:hover {
          color: #fff;
        }
        .modal-title {
          margin-bottom: 15px;
          font-size: 16px;
          font-weight: bold;
        }
        .modal-content {
          white-space: pre-wrap; /* 允许换行 */
          font-family: inherit;
          line-height: 1.5;
        }
      </style>
    </head>
    <body>
      <!-- 历史记录面板 -->
      <div class="history-panel">
        <div class="history-header">
          <span>历史记录</span>
          <button id="clearHistoryBtn" title="清空历史">🗑️</button>
        </div>
        <div id="historyList" class="history-list">${historyHtml}</div>
      </div>

      <!-- 主内容区 -->
      <div class="main-content">
        <div class="toolbar">
          <button class="btn" id="formatBtn">格式化</button>
          <button class="btn" id="compressBtn">压缩</button>
          <button class="btn" id="unicode2cnBtn">Unicode转中文</button>
          <button class="btn" id="cn2unicodeBtn">中文转Unicode</button>
          <button class="btn btn-success" id="expandAllBtn">全展开</button>
          <button class="btn btn-danger" id="collapseAllBtn">全折叠</button>
        </div>

        <div class="container">
          <!-- JSON输入区 -->
          <div class="editor-wrap">
            <div class="editor-header">JSON输入区</div>
            <textarea id="inputArea" placeholder="请输入JSON代码..."></textarea>
          </div>
          <!-- JSON树视图 -->
          <div class="editor-wrap">
            <div class="editor-header tree-header">JSON树视图（可展开/折叠）</div>
            <div id="treeContainer" class="tree-container"></div>
          </div>
        </div>
        <div id="errorTip"></div>
      </div>

      <!-- 新增：完整内容弹窗容器（默认隐藏） -->
      <div id="fullContentModal" class="full-content-modal" style="display: none;">
        <span class="modal-close">&times;</span>
        <div class="modal-title">完整内容</div>
        <div class="modal-content" id="modalContent"></div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        const inputArea = document.getElementById('inputArea');
        const treeContainer = document.getElementById('treeContainer');
        const errorTip = document.getElementById('errorTip');
        const fullContentModal = document.getElementById('fullContentModal');
        const modalContent = document.getElementById('modalContent');
        const modalClose = document.querySelector('.modal-close');
        let currentTreeData = null;
        let activeHistoryItem = null;

        // 新增：打开完整内容弹窗
        function openFullContentModal(content) {
          modalContent.textContent = content;
          fullContentModal.style.display = 'block';
        }

        // 新增：关闭完整内容弹窗
        modalClose.addEventListener('click', () => {
          fullContentModal.style.display = 'none';
        });
        // 点击弹窗外部关闭
        window.addEventListener('click', (e) => {
          if (e.target === fullContentModal) {
            fullContentModal.style.display = 'none';
          }
        });

        // 加载历史记录内容
        function loadHistory(id) {
          vscode.postMessage({ cmd: 'loadHistory', id });
        }

        // 渲染历史记录
        function renderHistory(records) {
          const list = document.getElementById('historyList');
          if (records.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">暂无历史记录</div>';
            return;
          }
          list.innerHTML = records.map(r => \`
            <div class="history-item" data-id="\${r.id}">
              <div class="history-time">\${r.timestamp}</div>
              <div class="history-size">\${r.size}</div>
            </div>
          \`).join('');
          bindHistoryClick();
        }

        // 绑定历史记录点击事件
        function bindHistoryClick() {
          document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
              if (activeHistoryItem) activeHistoryItem.classList.remove('active');
              item.classList.add('active');
              activeHistoryItem = item;
              loadHistory(item.dataset.id);
            });
          });
        }

        // 渲染JSON树视图 - 新增：长文本省略+view all交互
        function renderJsonTree(data, isExpandAll = true) {
          treeContainer.innerHTML = '';
          if (!data || typeof data !== 'object' || data === null) {
            treeContainer.innerHTML = '<div style="color: #fff;">无有效JSON数据</div>';
            return;
          }
          currentTreeData = data;

          function buildTree(parent, node, level = 0, isExpand = true) {
            const isArray = Array.isArray(node);
            const entries = isArray ? Array.from(node.entries()) : Object.entries(node);
            
            const root = document.createElement('div');
            root.className = 'tree-root';
            const title = document.createElement('div');
            const typeLabel = isArray ? \`Array [\${node.length}]\` : 'Object';
            title.innerHTML = \`
              <button class="tree-toggle">\${isExpand ? '⊖' : '⊕'}</button>
              <span style="color: #a6e22e;">\${typeLabel}</span>
            \`;
            root.appendChild(title);

            const children = document.createElement('div');
            children.className = 'tree-children';
            children.style.display = isExpand ? 'block' : 'none';
            root.appendChild(children);

            // 折叠/展开按钮事件
            title.querySelector('.tree-toggle').addEventListener('click', () => {
              children.style.display = children.style.display === 'none' ? 'block' : 'none';
              title.querySelector('.tree-toggle').textContent = children.style.display === 'none' ? '⊕' : '⊖';
            });

            if (entries.length > 0) {
              entries.forEach(([key, value]) => {
                const nodeEl = document.createElement('div');
                nodeEl.className = 'tree-node';
                nodeEl.style.marginLeft = \`\${Math.min(level * 16, 200)}px\`;

                const keySpan = document.createElement('span');
                keySpan.className = 'tree-node__key';
                keySpan.textContent = isArray ? \`[\${key}]\` : \`\${key}:\`;
                nodeEl.appendChild(keySpan);

                // 根据值类型渲染 - 新增：长文本省略+view all
                if (value === null) {
                  const valSpan = document.createElement('span');
                  valSpan.className = 'tree-node__null';
                  valSpan.textContent = 'null';
                  nodeEl.appendChild(valSpan);
                } else if (typeof value === 'string') {
                  const valSpan = document.createElement('span');
                  valSpan.className = 'tree-node__string';
                  if (value.length > 50) {
                    // 长文本：显示前50字符+...+view all
                    valSpan.textContent = \`"\${value.slice(0, 50)}...\`;
                    const viewAllBtn = document.createElement('span');
                    viewAllBtn.className = 'view-all-btn';
                    viewAllBtn.textContent = 'view all';
                    // 点击按钮打开完整内容弹窗
                    viewAllBtn.addEventListener('click', (e) => {
                      e.stopPropagation(); // 防止触发父节点的折叠事件
                      openFullContentModal(value);
                    });
                    valSpan.appendChild(viewAllBtn);
                    valSpan.appendChild(document.createTextNode('"'));
                  } else {
                    // 短文本：直接显示
                    valSpan.textContent = \`"\${value}"\`;
                  }
                  nodeEl.appendChild(valSpan);
                } else if (typeof value === 'number') {
                  const valSpan = document.createElement('span');
                  valSpan.className = 'tree-node__number';
                  valSpan.textContent = value;
                  nodeEl.appendChild(valSpan);
                } else if (typeof value === 'boolean') {
                  const valSpan = document.createElement('span');
                  valSpan.className = 'tree-node__boolean';
                  valSpan.textContent = value;
                  nodeEl.appendChild(valSpan);
                } else if (typeof value === 'object') {
                  const nestedType = Array.isArray(value) ? \`Array [\${value.length}]\` : 'Object';
                  const valSpan = document.createElement('span');
                  valSpan.style.color = '#a6e22e';
                  valSpan.textContent = nestedType;
                  
                  const toggleBtn = document.createElement('button');
                  toggleBtn.className = 'tree-toggle';
                  toggleBtn.textContent = isExpandAll ? '⊖' : '⊕';
                  nodeEl.appendChild(toggleBtn);
                  nodeEl.appendChild(keySpan);
                  nodeEl.appendChild(valSpan);

                  const nestedChildren = document.createElement('div');
                  nestedChildren.style.display = isExpandAll ? 'block' : 'none';
                  nodeEl.appendChild(nestedChildren);

                  toggleBtn.addEventListener('click', () => {
                    nestedChildren.style.display = nestedChildren.style.display === 'none' ? 'block' : 'none';
                    toggleBtn.textContent = nestedChildren.style.display === 'none' ? '⊕' : '⊖';
                  });

                  buildTree(nestedChildren, value, level + 1, isExpandAll);
                }

                children.appendChild(nodeEl);
              });
            } else {
              const emptyTip = document.createElement('div');
              emptyTip.style.marginLeft = \`\${level * 16}px\`;
              emptyTip.style.color = '#888';
              emptyTip.textContent = isArray ? '[] (空数组)' : '{} (空对象)';
              children.appendChild(emptyTip);
            }

            parent.appendChild(root);
          }

          buildTree(treeContainer, data, 0, isExpandAll);
        }

        // 绑定按钮事件
        document.getElementById('formatBtn').addEventListener('click', () => {
          const val = inputArea.value.trim();
          if (!val) { errorTip.textContent = '请输入JSON内容！'; return; }
          try { 
            const parsed = JSON.parse(val);
            vscode.postMessage({ cmd: 'format', data: val });
          } catch (e) {
            errorTip.textContent = \`JSON格式错误：\${(e).message}\`;
            return;
          }
        });

        document.getElementById('compressBtn').addEventListener('click', () => {
          const val = inputArea.value.trim();
          if (!val) { errorTip.textContent = '请输入JSON内容！'; return; }
          vscode.postMessage({ cmd: 'compress', data: val });
        });

        document.getElementById('unicode2cnBtn').addEventListener('click', () => {
          const val = inputArea.value.trim();
          if (!val) { errorTip.textContent = '请输入JSON内容！'; return; }
          vscode.postMessage({ cmd: 'unicode2cn', data: val });
        });

        document.getElementById('cn2unicodeBtn').addEventListener('click', () => {
          const val = inputArea.value.trim();
          if (!val) { errorTip.textContent = '请输入JSON内容！'; return; }
          vscode.postMessage({ cmd: 'cn2unicode', data: val });
        });

        document.getElementById('expandAllBtn').addEventListener('click', () => {
          if (currentTreeData) {
            renderJsonTree(currentTreeData, true);
            errorTip.textContent = '';
          } else {
            errorTip.textContent = '暂无JSON数据可展开！';
          }
        });

        document.getElementById('collapseAllBtn').addEventListener('click', () => {
          if (currentTreeData) {
            renderJsonTree(currentTreeData, false);
            errorTip.textContent = '';
          } else {
            errorTip.textContent = '暂无JSON数据可折叠！';
          }
        });

        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
          if (confirm('确定清空所有历史记录？')) {
            vscode.postMessage({ cmd: 'clearHistory' });
            activeHistoryItem = null;
          }
        });

        // 监听VSCode消息
        window.addEventListener('message', (e) => {
          const msg = e.data;
          switch (msg.cmd) {
            case 'formatRes':
              inputArea.value = msg.data;
              renderJsonTree(msg.tree, true);
              errorTip.textContent = '';
              break;
            case 'compressRes':
            case 'unicode2cnRes':
            case 'cn2unicodeRes':
              inputArea.value = msg.data;
              errorTip.textContent = '';
              try { 
                const parsed = JSON.parse(msg.data);
                renderJsonTree(parsed, true); 
              } catch (err) { 
                treeContainer.innerHTML = '<div style="color: #ff5252;">无法渲染树视图：非标准JSON</div>'; 
              }
              break;
            case 'loadHistoryRes':
              inputArea.value = msg.data;
              errorTip.textContent = '';
              try { 
                const parsed = JSON.parse(msg.data);
                renderJsonTree(parsed, true); 
              } catch (err) { 
                treeContainer.innerHTML = '<div style="color: #ff5252;">无法渲染树视图：非标准JSON</div>'; 
              }
              break;
            case 'updateHistory':
              renderHistory(msg.data);
              break;
            case 'error':
              errorTip.textContent = msg.data;
              break;
            case 'expandAll':
              if (currentTreeData) renderJsonTree(currentTreeData, true);
              break;
            case 'collapseAll':
              if (currentTreeData) renderJsonTree(currentTreeData, false);
              break;
          }
        });

        // 初始化绑定历史记录点击
        bindHistoryClick();
      </script>
    </body>
    </html>
  `;
}
function deactivate() {
    if (jsonConverterPanel)
        jsonConverterPanel.dispose();
}
