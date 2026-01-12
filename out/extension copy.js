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
function activate(context) {
    // 初始化历史记录存储（使用VSCode全局状态，持久化）
    const historyStorageKey = 'jsonConverter.historyRecords';
    let historyRecords = context.globalState.get(historyStorageKey) || [];
    // 新增：保存历史记录的通用方法
    const saveHistoryRecord = (content, panel) => {
        const newRecord = {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleString('zh-CN'),
            content: content,
            size: formatFileSize(content.length)
        };
        // 插入到历史记录头部
        historyRecords.unshift(newRecord);
        // 限制历史记录数量（最多50条）
        if (historyRecords.length > 50) {
            historyRecords = historyRecords.slice(0, 50);
        }
        // 持久化存储
        context.globalState.update(historyStorageKey, historyRecords);
        // 同步到Webview
        panel.webview.postMessage({
            command: 'updateHistory',
            data: historyRecords
        });
    };
    // 注册打开面板命令
    const openPanelCommand = vscode.commands.registerCommand('json-converter.openPanel', () => {
        const panel = vscode.window.createWebviewPanel('jsonConverter', 'JSON Converter', vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'node_modules')),
                vscode.Uri.file(path.join(context.extensionPath, 'media'))
            ],
            retainContextWhenHidden: true
        });
        // 注入Webview内容（包含历史记录面板）
        panel.webview.html = getWebviewContent(panel.webview, context, historyRecords);
        // 监听Webview消息
        panel.webview.onDidReceiveMessage((message) => {
            console.log('主进程接收消息：', message);
            switch (message.command) {
                // 原有功能：格式化JSON
                case 'formatJson':
                    try {
                        const parsed = JSON.parse(message.data);
                        const formatted = JSON.stringify(parsed, null, 2);
                        // 直接调用通用方法保存历史记录（核心修复点）
                        saveHistoryRecord(message.data, panel);
                        // 返回格式化结果
                        panel.webview.postMessage({
                            command: 'formatResult',
                            data: formatted,
                            treeData: parsed
                        });
                    }
                    catch (e) {
                        panel.webview.postMessage({ command: 'error', data: `JSON格式错误：${e.message}` });
                    }
                    break;
                // 原有功能：压缩JSON
                case 'compressJson':
                    try {
                        const parsed = JSON.parse(message.data);
                        const compressed = JSON.stringify(parsed);
                        // 直接保存历史记录
                        saveHistoryRecord(message.data, panel);
                        panel.webview.postMessage({ command: 'compressResult', data: compressed });
                    }
                    catch (e) {
                        panel.webview.postMessage({ command: 'error', data: `JSON格式错误：${e.message}` });
                    }
                    break;
                // 原有功能：Unicode转中文
                case 'unicodeToChinese':
                    try {
                        const result = unescape(message.data.replace(/\\u/g, '%u'));
                        // 直接保存历史记录
                        saveHistoryRecord(message.data, panel);
                        panel.webview.postMessage({ command: 'unicodeToChineseResult', data: result });
                    }
                    catch (e) {
                        panel.webview.postMessage({ command: 'error', data: `转换失败：${e.message}` });
                    }
                    break;
                // 原有功能：中文转Unicode
                case 'chineseToUnicode':
                    try {
                        const result = message.data.split('').map((char) => {
                            const code = char.charCodeAt(0);
                            return code > 127 ? '\\u' + code.toString(16).padStart(4, '0') : char;
                        }).join('');
                        // 直接保存历史记录
                        saveHistoryRecord(message.data, panel);
                        panel.webview.postMessage({ command: 'chineseToUnicodeResult', data: result });
                    }
                    catch (e) {
                        panel.webview.postMessage({ command: 'error', data: `转换失败：${e.message}` });
                    }
                    break;
                // 原有功能：全展开/全折叠
                case 'expandAll':
                    panel.webview.postMessage({ command: 'expandAllTree' });
                    break;
                case 'collapseAll':
                    panel.webview.postMessage({ command: 'collapseAllTree' });
                    break;
                // 加载历史记录
                case 'loadHistory':
                    const record = historyRecords.find(item => item.id === message.id);
                    if (record) {
                        panel.webview.postMessage({
                            command: 'loadHistoryResult',
                            data: record.content
                        });
                    }
                    break;
                // 清空历史记录
                case 'clearHistory':
                    historyRecords = [];
                    context.globalState.update(historyStorageKey, []);
                    panel.webview.postMessage({ command: 'updateHistory', data: [] });
                    break;
            }
        }, undefined, context.subscriptions);
    });
    context.subscriptions.push(openPanelCommand);
}
// 辅助函数：格式化文件大小（字节→KB/MB）
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    }
    else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    }
    else {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
}
// 生成Webview内容（新增历史记录面板，修复模板字符串编译错误）
function getWebviewContent(webview, context, initialHistory) {
    const prismCss = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-okaidia.min.css';
    const prismJs = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js';
    // 手动拼接初始历史记录HTML（替换模板字符串）
    let initialHistoryHtml = '';
    for (let i = 0; i < initialHistory.length; i++) {
        const record = initialHistory[i];
        initialHistoryHtml += '<div class="history-item" data-id="' + record.id + '">';
        initialHistoryHtml += '  <div class="history-time">' + record.timestamp + '</div>';
        initialHistoryHtml += '  <div class="history-size">' + record.size + '</div>';
        initialHistoryHtml += '</div>';
    }
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JSON Converter</title>
  <link rel="stylesheet" href="${prismCss}">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Consolas, Monaco, 'Courier New', monospace;
      padding: 0;
      display: flex;
      flex-direction: row;
      height: 100vh;
      background: #f5f5f5;
      overflow: hidden;
    }

    /* ========== 历史记录面板样式 ========== */
    .history-panel {
      width: 220px;
      background: #fff;
      border-right: 1px solid #e0e0e0;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .history-header {
      padding: 12px 16px;
      background: #007acc;
      color: white;
      font-size: 14px;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .history-header button {
      background: transparent;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 16px;
    }
    .history-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .history-item {
      padding: 8px 12px;
      margin-bottom: 4px;
      background: #f9f9f9;
      border-radius: 4px;
      cursor: pointer;
      border-left: 3px solid transparent;
      transition: all 0.2s;
    }
    .history-item:hover {
      background: #e8f0fe;
      border-left-color: #007acc;
    }
    .history-item.active {
      background: #e8f0fe;
      border-left-color: #007acc;
    }
    .history-time {
      font-size: 12px;
      color: #666;
      margin-bottom: 4px;
    }
    .history-size {
      font-size: 11px;
      color: #999;
      text-align: right;
    }

    /* ========== 主内容区样式 ========== */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 16px;
      height: 100vh;
    }

    /* 工具栏样式 */
    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
      padding: 8px;
      background: #fff;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .btn {
      padding: 6px 12px;
      background: #007acc;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #005f99;
    }
    .btn-danger {
      background: #e53935;
    }
    .btn-danger:hover {
      background: #c62828;
    }
    .btn-success {
      background: #43a047;
    }
    .btn-success:hover {
      background: #2e7d32;
    }

    /* 容器布局 */
    .container {
      display: flex;
      gap: 16px;
      flex: 1;
      overflow: hidden;
    }
    .editor-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #fff;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .editor-header {
      padding: 8px 16px;
      background: #007acc;
      color: white;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .tree-header {
      background: #43a047;
    }
    textarea {
      flex: 1;
      width: 100%;
      padding: 16px;
      border: none;
      font-size: 14px;
      line-height: 1.5;
      resize: none;
      font-family: Consolas, Monaco, 'Courier New', monospace;
      background: #272822;
      color: #f8f8f2;
      outline: none;
    }

    /* JSON树视图容器 */
    .tree-container {
      flex: 1;
      padding: 16px;
      overflow: auto;
      background: #272822;
      color: #f8f8f2;
    }

    /* 错误提示 */
    #error提示 {
      color: #ff5252;
      margin-top: 8px;
      height: 20px;
      line-height: 20px;
      padding-left: 8px;
      font-size: 14px;
    }

    /* 原生树节点样式 */
    .tree-node {
      margin-left: 20px;
      padding: 2px 0;
    }
    .tree-node__key {
      color: #f92672;
      margin-right: 4px;
    }
    .tree-node__value {
      color: #a6e22e;
    }
    .tree-node__string {
      color: #e6db74;
    }
    .tree-node__number {
      color: #66d9ef;
    }
    .tree-node__boolean {
      color: #ae81ff;
    }
    .tree-node__null {
      color: #888888;
    }
    .tree-toggle {
      background: transparent;
      border: none;
      color: #fff;
      cursor: pointer;
      font-size: 12px;
      margin-right: 4px;
      padding: 0;
      width: 16px;
      height: 16px;
    }
  </style>
</head>
<body>
  <!-- ========== 左侧历史记录面板 ========== -->
  <div class="history-panel">
    <div class="history-header">
      <span>历史记录</span>
      <button id="clearHistoryBtn" title="清空历史">🗑️</button>
    </div>
    <div id="historyList" class="history-list">
      <!-- 初始历史记录渲染 -->
      ${initialHistoryHtml}
    </div>
  </div>

  <!-- ========== 右侧主内容区 ========== -->
  <div class="main-content">
    <!-- 工具栏 -->
    <div class="toolbar">
      <button class="btn" id="formatBtn">格式化</button>
      <button class="btn" id="compressBtn">压缩</button>
      <button class="btn" id="unicodeToChineseBtn">Unicode转中文</button>
      <button class="btn" id="chineseToUnicodeBtn">中文转Unicode</button>
      <button class="btn btn-success" id="expandAllBtn">全展开</button>
      <button class="btn btn-danger" id="collapseAllBtn">全折叠</button>
    </div>

    <!-- 主容器：输入区 + 树视图输出区 -->
    <div class="container">
      <!-- 输入区 -->
      <div class="editor-wrap">
        <div class="editor-header">JSON输入区</div>
        <textarea id="inputArea" placeholder="请输入JSON代码..."></textarea>
      </div>

      <!-- 树视图输出区 -->
      <div class="editor-wrap">
        <div class="editor-header tree-header">JSON树视图（可展开/折叠）</div>
        <div id="treeContainer" class="tree-container"></div>
        <pre style="display: none;"><code id="outputCode" class="language-json"></code></pre>
      </div>
    </div>

    <!-- 错误提示 -->
    <div id="error提示"></div>
  </div>

  <script src="${prismJs}"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const vscode = acquireVsCodeApi();
      const inputArea = document.getElementById('inputArea');
      const treeContainer = document.getElementById('treeContainer');
      const error提示 = document.getElementById('error提示');
      const historyList = document.getElementById('historyList');
      const clearHistoryBtn = document.getElementById('clearHistoryBtn');
      
      let currentTreeData = null;
      let activeHistoryItem = null;

      // ========== 历史记录功能 ==========
      // 1. 加载历史记录内容
      function loadHistoryContent(recordId) {
        vscode.postMessage({
          command: 'loadHistory',
          id: recordId
        });
      }

      // 2. 渲染历史记录列表（替换模板字符串为字符串拼接）
      function renderHistoryList(records) {
        let html = '';
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          html += '<div class="history-item" data-id="' + record.id + '">';
          html += '  <div class="history-time">' + record.timestamp + '</div>';
          html += '  <div class="history-size">' + record.size + '</div>';
          html += '</div>';
        }
        historyList.innerHTML = html;
        
        // 重新绑定点击事件
        bindHistoryItemClick();
      }

      // 3. 绑定历史记录项点击事件
      function bindHistoryItemClick() {
        const historyItems = document.querySelectorAll('.history-item');
        historyItems.forEach(item => {
          item.addEventListener('click', () => {
            // 移除其他项的激活状态
            if (activeHistoryItem) {
              activeHistoryItem.classList.remove('active');
            }
            // 设置当前项激活状态
            item.classList.add('active');
            activeHistoryItem = item;
            // 加载选中的历史记录
            loadHistoryContent(item.dataset.id);
          });
        });
      }

      // 4. 清空历史记录
      clearHistoryBtn.addEventListener('click', () => {
        if (confirm('确定清空所有历史记录？')) {
          vscode.postMessage({ command: 'clearHistory' });
          historyList.innerHTML = '';
          activeHistoryItem = null;
        }
      });

      // ========== 按钮事件绑定 ==========
      // 格式化
      document.getElementById('formatBtn').addEventListener('click', () => {
        error提示.textContent = '';
        const input = inputArea.value.trim();
        if (!input) {
          error提示.textContent = '请输入JSON内容！';
          return;
        }
        try {
          JSON.parse(input); // 前置校验
        } catch (e) {
          error提示.textContent = 'JSON格式错误：' + (e instanceof Error ? e.message : '未知错误');
          return;
        }
        vscode.postMessage({ command: 'formatJson', data: input });
      });

      // 压缩
      document.getElementById('compressBtn').addEventListener('click', () => {
        error提示.textContent = '';
        const input = inputArea.value.trim();
        if (!input) {
          error提示.textContent = '请输入JSON内容！';
          return;
        }
        vscode.postMessage({ command: 'compressJson', data: input });
      });

      // Unicode转中文
      document.getElementById('unicodeToChineseBtn').addEventListener('click', () => {
        error提示.textContent = '';
        const input = inputArea.value.trim();
        if (!input) {
          error提示.textContent = '请输入JSON内容！';
          return;
        }
        vscode.postMessage({ command: 'unicodeToChinese', data: input });
      });

      // 中文转Unicode
      document.getElementById('chineseToUnicodeBtn').addEventListener('click', () => {
        error提示.textContent = '';
        const input = inputArea.value.trim();
        if (!input) {
          error提示.textContent = '请输入JSON内容！';
          return;
        }
        vscode.postMessage({ command: 'chineseToUnicode', data: input });
      });

      // 全展开/全折叠
      document.getElementById('expandAllBtn').addEventListener('click', () => {
        currentTreeData && renderJsonTree(currentTreeData, true);
      });
      document.getElementById('collapseAllBtn').addEventListener('click', () => {
        currentTreeData && renderJsonTree(currentTreeData, false);
      });

      // ========== 接收主进程消息 ==========
      window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
          // 加载历史记录结果
          case 'loadHistoryResult':
            inputArea.value = message.data;
            error提示.textContent = '';
            // 自动格式化加载的历史内容
            try {
              const parsed = JSON.parse(message.data);
              const formatted = JSON.stringify(parsed, null, 2);
              renderJsonTree(parsed, true);
            } catch (e) {
              treeContainer.innerHTML = '<div style="color: #ff5252;">无法渲染树视图：非标准JSON</div>';
            }
            break;

          // 更新历史记录列表
          case 'updateHistory':
            renderHistoryList(message.data);
            break;

          // 格式化结果
          case 'formatResult':
            currentTreeData = message.treeData;
            renderJsonTree(message.treeData, true);
            highlightCode(message.data);
            break;

          // 其他转换结果
          case 'compressResult':
          case 'unicodeToChineseResult':
          case 'chineseToUnicodeResult':
            try {
              const parsed = JSON.parse(message.data);
              currentTreeData = parsed;
              renderJsonTree(parsed, true);
              highlightCode(message.data);
            } catch (e) {
              treeContainer.innerHTML = '<div style="color: #ff5252;">无法渲染树视图：非标准JSON</div>';
              highlightCode(message.data);
            }
            break;

          // 错误提示
          case 'error':
            error提示.textContent = message.data;
            treeContainer.innerHTML = '';
            currentTreeData = null;
            break;
        }
      });

      // ========== 原生JSON树渲染 ==========
      function renderJsonTree(jsonData, isExpandAll = true) {
        treeContainer.innerHTML = '';
        if (!jsonData || typeof jsonData !== 'object' || jsonData === null) {
          treeContainer.innerHTML = '<div style="color: #fff;">无有效JSON数据</div>';
          return;
        }

        function buildTree(parentEl, data, level = 0, isExpand = true) {
          const isRoot = level === 0;
          const isArray = Array.isArray(data);
          const entries = isArray ? data.entries() : Object.entries(data);

          const rootNode = document.createElement('div');
          rootNode.className = 'tree-root';
          
          const rootTitle = document.createElement('div');
          rootTitle.style.marginBottom = '8px';
          const typeLabel = isArray ? 'Array [' + data.length + ']' : 'Object';
          rootTitle.innerHTML = '<span style="color: #a6e22e;">' + typeLabel + '</span>';
          
          const rootToggle = document.createElement('button');
          rootToggle.className = 'tree-toggle';
          rootToggle.textContent = isExpand ? '⊖' : '⊕';
          rootToggle.onclick = () => {
            const childContainer = rootNode.querySelector('.tree-children');
            childContainer.style.display = childContainer.style.display === 'none' ? 'block' : 'none';
            rootToggle.textContent = childContainer.style.display === 'none' ? '⊕' : '⊖';
          };
          rootTitle.insertBefore(rootToggle, rootTitle.firstChild);
          rootNode.appendChild(rootTitle);

          const childContainer = document.createElement('div');
          childContainer.className = 'tree-children';
          childContainer.style.display = isExpand ? 'block' : 'none';
          rootNode.appendChild(childContainer);

          for (const [key, value] of entries) {
            const nodeEl = document.createElement('div');
            nodeEl.className = 'tree-node';
            nodeEl.style.marginLeft = (level * 20) + 'px';

            const keySpan = document.createElement('span');
            keySpan.className = 'tree-node__key';
            keySpan.textContent = isArray ? '[' + key + ']' : key + ':';
            
            const valueSpan = document.createElement('span');
            const valueType = typeof value;

            if (value === null) {
              valueSpan.className = 'tree-node__null';
              valueSpan.textContent = 'null';
            } else if (valueType === 'string') {
              valueSpan.className = 'tree-node__string';
              valueSpan.textContent = '"' + value + '"';
            } else if (valueType === 'number') {
              valueSpan.className = 'tree-node__number';
              valueSpan.textContent = value;
            } else if (valueType === 'boolean') {
              valueSpan.className = 'tree-node__boolean';
              valueSpan.textContent = value;
            } else if (valueType === 'object') {
              valueSpan.className = 'tree-node__value';
              const nestedType = Array.isArray(value) ? 'Array [' + value.length + ']' : 'Object';
              valueSpan.textContent = nestedType;

              const nestedToggle = document.createElement('button');
              nestedToggle.className = 'tree-toggle';
              nestedToggle.textContent = isExpandAll ? '⊖' : '⊕';
              
              const nestedChildContainer = document.createElement('div');
              nestedChildContainer.style.display = isExpandAll ? 'block' : 'none';
              
              buildTree(nestedChildContainer, value, level + 1, isExpandAll);
              
              nestedToggle.onclick = () => {
                nestedChildContainer.style.display = nestedChildContainer.style.display === 'none' ? 'block' : 'none';
                nestedToggle.textContent = nestedChildContainer.style.display === 'none' ? '⊕' : '⊖';
              };

              nodeEl.appendChild(nestedToggle);
              nodeEl.appendChild(keySpan);
              nodeEl.appendChild(valueSpan);
              nodeEl.appendChild(nestedChildContainer);
            } else {
              valueSpan.className = 'tree-node__value';
              valueSpan.textContent = value;
            }

            if (valueType !== 'object' || value === null) {
              nodeEl.appendChild(keySpan);
              nodeEl.appendChild(valueSpan);
            }

            childContainer.appendChild(nodeEl);
          }

          parentEl.appendChild(rootNode);
        }

        buildTree(treeContainer, jsonData, 0, isExpandAll);
      }

      // ========== 语法高亮 ==========
      function highlightCode(code) {
        const outputCode = document.getElementById('outputCode');
        outputCode && (outputCode.textContent = code) && Prism.highlightElement(outputCode);
      }

      // 初始化绑定历史记录点击事件
      bindHistoryItemClick();
    });
  </script>
</body>
</html>
  `;
}
function deactivate() { }
