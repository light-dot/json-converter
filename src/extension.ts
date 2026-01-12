import * as vscode from 'vscode';
import * as path from 'path';

// 历史记录类型定义
interface HistoryRecord {
  id: string;
  timestamp: string;
  content: string;
  size: string;
}

let jsonConverterPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  // 1. 注册「打开面板」核心命令
  const openPanelCmd = vscode.commands.registerCommand('json-converter.openPanel', () => {
    createOrShowJsonPanel(context);
  });

  // 2. 创建空的TreeDataProvider（仅占位，消除「无数据提供者」提示）
  const treeProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
    getTreeItem: (item: vscode.TreeItem) => item,
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
function createOrShowJsonPanel(context: vscode.ExtensionContext) {
  // 如果面板已存在，直接显示
  if (jsonConverterPanel) {
    jsonConverterPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  // 创建新面板
  jsonConverterPanel = vscode.window.createWebviewPanel(
    'jsonConverter', // 面板唯一标识
    'JSON转换器',     // 面板标题
    vscode.ViewColumn.One, // 显示在第一列
    {
      enableScripts: true, // 允许Webview执行JS
      retainContextWhenHidden: true, // 隐藏时保留上下文
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
    }
  );

  // 面板销毁时重置
  jsonConverterPanel.onDidDispose(() => {
    jsonConverterPanel = undefined;
  }, null, context.subscriptions);

  // 初始化历史记录
  const historyKey = 'jsonConverter.history';
  let historyRecords: HistoryRecord[] = context.globalState.get<HistoryRecord[]>(historyKey) || [];

  // 保存历史记录方法
  const saveHistory = (content: string) => {
    const record: HistoryRecord = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('zh-CN'),
      content: content,
      size: formatSize(content.length)
    };
    historyRecords.unshift(record);
    historyRecords = historyRecords.slice(0, 50); // 最多保留50条
    context.globalState.update(historyKey, historyRecords);
    jsonConverterPanel?.webview.postMessage({ cmd: 'updateHistory', data: historyRecords });
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
          jsonConverterPanel?.webview.postMessage({ cmd: 'formatRes', data: formatted, tree: parsed });
          break;
        }
        case 'compress': {
          const parsed = JSON.parse(msg.data);
          const compressed = JSON.stringify(parsed);
          saveHistory(msg.data);
          jsonConverterPanel?.webview.postMessage({ cmd: 'compressRes', data: compressed });
          break;
        }
        case 'unicode2cn': {
          const res = unescape(msg.data.replace(/\\u/g, '%u'));
          saveHistory(msg.data);
          jsonConverterPanel?.webview.postMessage({ cmd: 'unicode2cnRes', data: res });
          break;
        }
        case 'cn2unicode': {
          const res = msg.data.split('').map((c: string) => {
            const code = c.charCodeAt(0);
            return code > 127 ? `\\u${code.toString(16).padStart(4, '0')}` : c;
          }).join('');
          saveHistory(msg.data);
          jsonConverterPanel?.webview.postMessage({ cmd: 'cn2unicodeRes', data: res });
          break;
        }
        case 'expandAll':
          jsonConverterPanel?.webview.postMessage({ cmd: 'expandAll' });
          break;
        case 'collapseAll':
          jsonConverterPanel?.webview.postMessage({ cmd: 'collapseAll' });
          break;
        case 'loadHistory': {
          const record = historyRecords.find(r => r.id === msg.id);
          jsonConverterPanel?.webview.postMessage({ cmd: 'loadHistoryRes', data: record?.content || '' });
          break;
        }
        case 'clearHistory': {
          historyRecords = [];
          context.globalState.update(historyKey, []);
          jsonConverterPanel?.webview.postMessage({ cmd: 'updateHistory', data: [] });
          break;
        }
      }
    } catch (e) {
      jsonConverterPanel?.webview.postMessage({ 
        cmd: 'error', 
        data: `操作失败：${(e as Error).message}` 
      });
    }
  });
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 生成Webview HTML（完整UI）
function getWebviewHtml(initialHistory: HistoryRecord[]): string {
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
        .container { display: flex; gap: 16px; flex: 1; overflow: hidden; }
        .editor-wrap {
          flex: 1; display: flex; flex-direction: column;
          background: #fff; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
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
          flex: 1; padding: 16px; overflow: auto;
          background: #272822; color: #f8f8f2; font-family: inherit;
        }
        #errorTip {
          color: #ff5252; margin-top: 8px; height: 20px; line-height: 20px;
          padding-left: 8px; font-size: 14px;
        }

        /* 树视图样式 */
        .tree-node { margin-left: 20px; padding: 2px 0; }
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

      <script>
        const vscode = acquireVsCodeApi();
        const inputArea = document.getElementById('inputArea');
        const treeContainer = document.getElementById('treeContainer');
        const errorTip = document.getElementById('errorTip');
        let currentTreeData = null;
        let activeHistoryItem = null;

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

        // 渲染JSON树视图
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

            // 渲染子节点
            entries.forEach(([key, value]) => {
              const nodeEl = document.createElement('div');
              nodeEl.className = 'tree-node';
              nodeEl.style.marginLeft = \`\${level * 20}px\`;

              const keySpan = document.createElement('span');
              keySpan.className = 'tree-node__key';
              keySpan.textContent = isArray ? \`[\${key}]\` : \`\${key}:\`;
              nodeEl.appendChild(keySpan);

              // 根据值类型渲染
              if (value === null) {
                const valSpan = document.createElement('span');
                valSpan.className = 'tree-node__null';
                valSpan.textContent = 'null';
                nodeEl.appendChild(valSpan);
              } else if (typeof value === 'string') {
                const valSpan = document.createElement('span');
                valSpan.className = 'tree-node__string';
                valSpan.textContent = \`"\${value}"\`;
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

            parent.appendChild(root);
          }

          buildTree(treeContainer, data, 0, isExpandAll);
        }

        // 绑定按钮事件
        document.getElementById('formatBtn').addEventListener('click', () => {
          const val = inputArea.value.trim();
          if (!val) { errorTip.textContent = '请输入JSON内容！'; return; }
          try { JSON.parse(val); } catch (e) {
            errorTip.textContent = \`JSON格式错误：\${(e).message}\`;
            return;
          }
          vscode.postMessage({ cmd: 'format', data: val });
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
          if (currentTreeData) renderJsonTree(currentTreeData, true);
          else errorTip.textContent = '暂无JSON数据可展开！';
        });

        document.getElementById('collapseAllBtn').addEventListener('click', () => {
          if (currentTreeData) renderJsonTree(currentTreeData, false);
          else errorTip.textContent = '暂无JSON数据可折叠！';
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
              try { renderJsonTree(JSON.parse(msg.data), true); } 
              catch (err) { treeContainer.innerHTML = '<div style="color: #ff5252;">无法渲染树视图：非标准JSON</div>'; }
              break;
            case 'loadHistoryRes':
              inputArea.value = msg.data;
              errorTip.textContent = '';
              try { renderJsonTree(JSON.parse(msg.data), true); }
              catch (err) { treeContainer.innerHTML = '<div style="color: #ff5252;">无法渲染树视图：非标准JSON</div>'; }
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

export function deactivate() {
  if (jsonConverterPanel) jsonConverterPanel.dispose();
}