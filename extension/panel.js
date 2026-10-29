'use strict';
const fs = require('fs');
const path = require('path');
const call = (message, ...args) => Editor.Message.request('cocos-codex-bridge', message, ...args);
const tabs = ['overview', 'capabilities', 'templates', 'typography', 'uilayout', 'sceneview', 'prefabs', 'workflows', 'activity', 'settings'];
exports.template = fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8');
exports.style = fs.readFileSync(path.join(__dirname, 'panel.css'), 'utf8');
exports.$ = { root: '#app' };
exports.ready = function () {
  const root = this.$.root;
  let data, busy = false, selected = 'overview', closed = false, templateBusy = false, generatedRoot;
  let prefabBusy = false, prefabContext;
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const text = (selector, value) => { $(selector).textContent = value; };
  const row = (tag, className, value) => { const e = document.createElement(tag); e.className = className; if (value !== undefined) e.textContent = value; return e; };
  const notify = message => { text('#notice', message); $('#notice').hidden = false; };
  let workflowBusy = false, buildPolling = false;
  let sceneViewBusy = false;
  async function sceneViewAction(action) {
    if (sceneViewBusy) return;
    sceneViewBusy = true; $$('[data-scene-view],[data-reference-image]').forEach(b => { b.disabled = true; });
    try {
      let params = { action };
      if (action === 'configure') Object.assign(params, { tool: $('#view-tool').value, pivot: $('#view-pivot').value, coordinate: $('#view-coordinate').value, is2D: $('#view-2d').checked, grid: $('#view-grid').checked, icon3D: $('#view-icon-3d').checked, iconSize: Number($('#view-icon-size').value) });
      if (action === 'focus') {
        const selected = await call('workflow-action', 'selection', {});
        if (!selected.uuids?.length) throw new Error('请在层级中至少选中一个项目节点。');
        params = { action, nodes: selected.uuids };
      }
      const result = await call('workflow-action', 'scene.view', params); text('#scene-view-result', JSON.stringify(result, null, 2));
      if (result.state) { $('#view-tool').value = result.state.tool; $('#view-pivot').value = result.state.pivot; $('#view-coordinate').value = result.state.coordinate; $('#view-2d').checked = result.state.is2D; $('#view-grid').checked = result.state.grid; $('#view-icon-3d').checked = result.state.icon3D; $('#view-icon-size').value = result.state.iconSize; }
      notify(action === 'configure' ? '场景视图设置已应用并完成原生回读。' : '场景视图操作完成，结果见下方。');
    } catch (error) { notify(error.message); }
    finally { sceneViewBusy = false; $$('[data-scene-view],[data-reference-image]').forEach(b => { b.disabled = false; }); refresh(); }
  }
  for (const button of $$('[data-scene-view]')) button.addEventListener('click', () => sceneViewAction(button.dataset.sceneView));
  for (const button of $$('[data-reference-image]')) button.addEventListener('click', async () => {
    if (sceneViewBusy) return;
    sceneViewBusy = true; $$('[data-scene-view],[data-reference-image]').forEach(b => { b.disabled = true; });
    try {
      const action = button.dataset.referenceImage, params = { action };
      if (['add', 'configure'].includes(action)) params.path = $('#reference-path').value.trim();
      if (action === 'add') params.paths = [params.path];
      if (action === 'configure') Object.assign(params, { x: Number($('#reference-x').value), y: Number($('#reference-y').value), sx: Number($('#reference-sx').value), sy: Number($('#reference-sy').value), opacity: Number($('#reference-opacity').value) });
      const result = await call('workflow-action', 'reference.image', params); text('#scene-view-result', JSON.stringify(result, null, 2));
      if (result.current) { $('#reference-path').value = result.current.path || $('#reference-path').value; $('#reference-x').value = result.current.x; $('#reference-y').value = result.current.y; $('#reference-sx').value = result.current.sx; $('#reference-sy').value = result.current.sy; $('#reference-opacity').value = result.current.opacity; }
      notify('参考图' + (action === 'clear' ? '已清空' : '操作完成') + '，结果见下方。');
    } catch (error) { notify(error.message); }
    finally { sceneViewBusy = false; $$('[data-scene-view],[data-reference-image]').forEach(b => { b.disabled = false; }); refresh(); }
  });
  let typographyBusy = false;
  for (const button of $$('[data-typography]')) button.addEventListener('click', async () => {
    if (typographyBusy) return;
    typographyBusy = true; $$('[data-typography]').forEach(b => { b.disabled = true; });
    try {
      const action = button.dataset.typography;
      let params;
      if (action === 'font.inspect') params = { asset: $('#text-font').value.trim(), text: $('#text-content').value };
      else {
        let node = $('#text-node').value.trim();
        if (!node) {
          const selection = await call('workflow-action', 'selection', {});
          if (selection.uuids?.length !== 1) throw new Error('请填写目标，或在层级中只选中一个项目节点。');
          node = selection.uuids[0];
        }
        params = { node };
        if (action === 'ui.measure') Object.assign(params, { subtree: true, maxNodes: 200 });
        if (action === 'text.inspect' || action === 'text.configure') params.component = $('#text-component').value;
        if (action === 'text.configure') {
          params.dryRun = button.dataset.dry === 'true';
          if ($('#text-apply-content').checked) params.text = $('#text-content').value;
          if ($('#text-size').value !== '') params.fontSize = Number($('#text-size').value);
          const mode = $('#text-font-mode').value;
          if (mode !== 'keep') params.font = { [mode]: $('#text-font').value.trim() };
        }
      }
      const result = await call('workflow-action', action, params);
      text('#typography-result', JSON.stringify(result, null, 2));
      const issues = $('#typography-issues'); issues.replaceChildren();
      for (const issue of result.issues || []) {
        const item = row('article', 'history-row');
        item.append(row('code', '', `${issue.severity} · ${issue.rule}`), row('p', 'muted', issue.path));
        const locate = row('button', 'button', '选中问题节点');
        locate.addEventListener('click', async () => {
          try { await call('workflow-action', 'selection', { uuids: [issue.node] }); notify('已在层级中选中问题节点。'); }
          catch (error) { notify(error.message); }
        });
        item.append(locate); issues.append(item);
      }
      notify(action === 'text.configure' ? (params.dryRun ? '配置预检查通过，未修改场景。' : '配置已应用并回读，请检查预览后保存场景。') : '检查完成，结果见下方；诊断范围和预算会随结果返回。');
    } catch (error) { notify(error.message); }
    finally { typographyBusy = false; $$('[data-typography]').forEach(b => { b.disabled = false; }); refresh(); }
  });
  let uiLayoutBusy = false;
  for (const button of $$('[data-ui-layout]')) button.addEventListener('click', async () => {
    if (uiLayoutBusy) return;
    uiLayoutBusy = true; $$('[data-ui-layout]').forEach(b => { b.disabled = true; });
    try {
      const action = button.dataset.uiLayout;
      let node = $('#layout-node').value.trim();
      if (!node) {
        const selection = await call('workflow-action', 'selection', {});
        if (selection.uuids?.length !== 1) throw new Error('请填写目标，或在层级中只选中一个项目节点。');
        node = selection.uuids[0];
      }
      const params = { action, node, component: $('#layout-component').value, properties: {}, ensure: true };
      if (action === 'configure' || action === 'ensure') {
        try { params.properties = JSON.parse($('#layout-properties').value || '{}'); }
        catch { throw new Error('语义属性必须是有效 JSON 对象。'); }
        params.dryRun = button.dataset.dry === 'true';
      }
      const result = await call('workflow-action', 'ui.layout', params);
      text('#ui-layout-result', JSON.stringify(result, null, 2));
      notify(action === 'remove' ? '布局组件已移除并完成回读。' : params.dryRun ? '布局预检查通过，未修改场景。' : '布局组件已应用并完成原生回读，请检查画面后保存。');
    } catch (error) { notify(error.message); }
    finally { uiLayoutBusy = false; $$('[data-ui-layout]').forEach(b => { b.disabled = false; }); refresh(); }
  });
  async function workflowAction(action, params) {
    const result = await call('workflow-action', action, params);
    text('#workflow-result', JSON.stringify(result, null, 2));
    if (action === 'build.start' && !result.dryRun && result.runId) $('#build-run').value = result.runId;
    if (action === 'build.start' || action === 'build.status') {
      text('#build-state', result.dryRun ? '预检查通过，尚未构建' : `${result.state} · ${Math.round((result.progress || 0) * 100)}% · ${result.message || ''}`);
      buildPolling = !result.dryRun && !result.terminal && ['waiting', 'processing'].includes(result.state);
    }
    return result;
  }
  for (const button of $$('[data-workflow]')) button.addEventListener('click', async () => {
    if (workflowBusy) return;
    workflowBusy = true; $$('[data-workflow]').forEach(b => { b.disabled = true; });
    try {
      const action = button.dataset.workflow;
      const params = action.startsWith('asset.') ? { asset: $('#resource-asset').value.trim(), ...(action === 'asset.graph' ? { direction: $('#resource-direction').value, depth: 3, maxNodes: 100, maxEdges: 300 } : {}) }
        : action.startsWith('animation.') || action === 'spine.inspect' ? { asset: $('#motion-asset').value.trim(), ...(action === 'animation.sample' ? { time: Number($('#motion-time').value) } : {}) }
        : action === 'build.start' ? { platform: $('#build-platform').value, scenes: $('#build-scenes').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean), dryRun: button.dataset.dry === 'true' }
        : action === 'build.platforms' ? {} : { runId: $('#build-run').value.trim() };
      await workflowAction(action, params);
      notify(action === 'build.start' && !params.dryRun ? '构建已提交；本页每 3 秒读取状态，成功后可检查产物并启动。' : '操作完成，结果见下方。');
    } catch (error) { notify(error.message); }
    finally { workflowBusy = false; $$('[data-workflow]').forEach(b => { b.disabled = false; }); refresh(); }
  });
  const buildTimer = setInterval(async () => {
    if (closed || selected !== 'workflows' || !buildPolling || workflowBusy) return;
    workflowBusy = true;
    try { await workflowAction('build.status', { runId: $('#build-run').value.trim() }); }
    catch (error) { buildPolling = false; notify(error.message); }
    finally { workflowBusy = false; }
  }, 3000);
  function select(page) {
    selected = page;
    for (const id of tabs) $(`#${id}`).hidden = id !== page;
    $$('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  }
  async function copy(value) {
    require('electron').clipboard.writeText(value);
    notify('已复制到剪贴板。');
  }
  for (const button of $$('[data-prefab]')) button.addEventListener('click', async () => {
    if (prefabBusy) return;
    prefabBusy = true; $$('[data-prefab]').forEach(b => { b.disabled = true; });
    try {
      const mode = button.dataset.prefab;
      let node;
      if (['inspect', 'precheck', 'create'].includes(mode)) {
        const selected = await call('prefab-action', 'selection', {});
        if (selected.uuids?.length !== 1) throw new Error('请在场景层级中只选择一个内容节点。');
        node = selected.uuids[0];
      }
      const params = mode === 'inspect' ? { node } : ['create', 'precheck'].includes(mode) ? { node, url: $('#prefab-url').value.trim(), dryRun: mode === 'precheck' }
        : ['validate', 'open'].includes(mode) ? { asset: $('#prefab-asset').value.trim() }
        : mode === 'save' ? { expectedRevision: prefabContext.revision } : { returnAsset: prefabContext.returnAsset };
      const action = mode === 'precheck' ? 'prefab.create' : `prefab.${mode}`;
      const result = await call('prefab-action', action, params);
      text('#prefab-result', JSON.stringify(result, null, 2));
      if (mode === 'create') { $('#prefab-asset').value = result.asset; await call('prefab-action', 'selection', { uuids: [result.node] }); }
      if (mode === 'open') { prefabContext = result; await call('prefab-action', 'selection', { uuids: [result.root] }); }
      if (mode === 'save') prefabContext.revision = result.revision;
      if (mode === 'close') prefabContext = undefined;
      notify(mode === 'create' ? '预制体已创建并选中新实例，请检查后保存场景。' : mode === 'save' ? '预制体已保存，备份 ID 见下方。' : '操作完成，结果见下方。');
    } catch (error) { notify(error.message); }
    finally {
      prefabBusy = false; $$('[data-prefab]').forEach(b => { b.disabled = ['save', 'close'].includes(b.dataset.prefab) && !prefabContext; }); refresh();
    }
  });
  $('#prefab-prompt').addEventListener('click', () => copy('查询 cocos_catalog 的 prefab 操作。先检查选中节点的引用；创建时先 dryRun，完成后使用返回的新 UUID。应用或保存前读取最新 revision，保留备份 ID，验证自定义脚本、贴图和按钮事件并保存重开。不要丢弃未保存内容。'));
  function capabilities() {
    const filter = $('#search').value.toLowerCase();
    const list = $('#operation-list'); list.replaceChildren();
    const matches = data.catalog.filter(op => `${op.action} ${op.description}`.toLowerCase().includes(filter));
    text('#operation-count', `${matches.length} 项可调用操作`);
    for (const op of matches) {
      const item = row('button', 'operation');
      item.append(row('code', '', op.action), row('span', op.readOnly ? 'badge read' : 'badge', op.readOnly ? '读取' : '操作'), row('p', 'muted', op.description));
      item.addEventListener('click', async () => {
        try { text('#schema', JSON.stringify(await call('operation-schema', op.action), null, 2)); }
        catch (error) { notify(error.message); }
      });
      list.append(item);
    }
  }
  function templates() {
    const list = $('#template-list'); list.replaceChildren();
    for (const template of data.templates) {
      const card = row('article', 'card template');
      card.append(row('div', 'eyebrow', 'UI TEMPLATE'), row('h3', '', template.title), row('p', 'muted', template.description));
      const actions = row('div', 'actions');
      for (const [label, dryRun] of [['预检查', true], ['生成到场景', false]]) {
        const button = row('button', dryRun ? 'button' : 'button primary', label);
        button.addEventListener('click', async () => {
          if (templateBusy) return;
          templateBusy = true;
          $$('#template-list button').forEach(b => { b.disabled = true; });
          notify(dryRun ? '正在检查 Canvas 与组件…' : '正在生成，完成后请检查场景；不会自动保存。');
          try {
            const output = await call('run-template', template.id, dryRun);
            text('#template-result', JSON.stringify(output, null, 2));
            const built = output.result?.steps?.[0]?.result;
            if (!dryRun && built?.root) { generatedRoot = built.root; $('#locate-ui').hidden = false; }
            notify(output.result?.ok ? (dryRun
              ? (built?.createCanvas ? '预检查完成：当前没有项目 Canvas；生成时会自动创建 Canvas 和 UI 相机。尚未修改场景。' : '预检查完成：项目 Canvas 和 UI 相机可用。尚未修改场景。')
              : `${built?.createdCanvas ? '已创建 Canvas 和 UI 相机，' : ''}已生成 ${built?.nodes?.length || 0} 个 UI 节点。${output.located ? '已切换到 2D 并定位；可在场景层级中查看。' : output.locationWarning || '点击“定位生成结果”查看。'}请检查画面后保存场景。`)
              : `生成失败：${output.result?.failed?.error || '请查看下面的失败步骤。'}`);
          } catch (error) { notify(error.message); }
          finally { templateBusy = false; $$('#template-list button').forEach(b => { b.disabled = false; }); refresh(); }
        });
        actions.append(button);
      }
      const copyButton = row('button', 'button', '复制 AI 指令');
      copyButton.addEventListener('click', () => copy(`使用 cocos_catalog 查询 ui.build，然后用模板 ${template.id} 先 dryRun 预检查，再生成到现有 Canvas 下；读取结果并截图验证，最后保存场景。`));
      actions.append(copyButton); card.append(actions); list.append(card);
    }
  }
  function activity() {
    const list = $('#history'); list.replaceChildren();
    if (!data.history?.length) { list.append(row('p', 'muted', '还没有操作记录。连接 AI 客户端后，执行过程会显示在这里。')); return; }
    for (const op of data.history) {
      const item = row('article', 'history-row');
      const heading = row('div', 'history-heading');
      heading.append(row('code', '', op.action), row('span', `badge ${op.state}`, op.state));
      item.append(heading, row('small', 'muted', `${op.requestId} · ${new Date(op.startedAt || op.queuedAt).toLocaleTimeString()}`));
      if (op.error) item.append(row('p', 'error', op.error));
      list.append(item);
    }
  }
  async function refresh() {
    if (busy || closed) return;
    busy = true;
    try {
      const first = !data;
      data = await call('dashboard');
      if (closed) return;
      text('#connection', data.settings.paused ? '编辑已暂停' : '桥接已就绪');
      $('#connection').classList.toggle('paused', data.settings.paused);
      text('#project-path', data.project || '等待编辑器…');
      text('#editor-version', `Creator ${data.editorVersion || '—'} · MCP ${data.mcpVersion || '—'}`);
      text('#stat-tools', '4'); text('#stat-operations', data.catalog.length);
      text('#stat-requests', data.traffic?.requests || 0); text('#stat-failed', data.counts?.failed || 0);
      text('#traffic', `${((data.traffic?.requestBytes || 0) / 1024).toFixed(1)} KB 请求 / ${((data.traffic?.responseBytes || 0) / 1024).toFixed(1)} KB 返回`);
      text('#pause', data.settings.paused ? '恢复编辑' : '暂停编辑');
      $('#scripts').checked = data.settings.allowScripts;
      text('#config', data.toml);
      text('#config-note', data.installationReady ? (data.installationMode === 'complete-extension' ? '完整扩展已就绪，无需另装 Node.js 或手动启动服务。复制配置加入客户端后连接；移动项目后请重新复制配置。' : '配置已填入本机路径。复制后加入客户端 MCP 设置并重启连接。') : data.installationError);
      $('#copy-config').disabled = !data.installationReady;
      $('#copy-json').disabled = !data.installationReady;
      activity();
      if (first) { capabilities(); templates(); }
    } catch (error) { notify(error.message); }
    finally { busy = false; }
  }
  $$('[data-page]').forEach(button => button.addEventListener('click', () => select(button.dataset.page)));
  $('#search').addEventListener('input', capabilities);
  $('#locate-ui').addEventListener('click', async () => {
    try { await call('locate-ui', generatedRoot); notify('已选中生成结果，切换到 2D 并聚焦。请查看 Creator 场景窗口。'); }
    catch (error) { notify(error.message); }
  });
  $('#refresh').addEventListener('click', refresh);
  $('#open-preview').addEventListener('click', async () => {
    const button = $('#open-preview'); button.disabled = true;
    try { await call('open-preview'); notify('已打开游戏预览。AI 可继续截图、点击并读取运行日志；页面打开不代表交互已通过验证。'); }
    catch (error) { notify(error.message); }
    finally { button.disabled = false; }
  });
  $('#pause').addEventListener('click', async () => {
    if (!data) return;
    try { await call('set-settings', { paused: !data.settings.paused }); await refresh(); }
    catch (error) { notify(error.message); }
  });
  $('#scripts').addEventListener('change', async () => {
    try { await call('set-settings', { allowScripts: $('#scripts').checked }); await refresh(); }
    catch (error) { notify(error.message); refresh(); }
  });
  $('#copy-config').addEventListener('click', () => data?.installationReady && copy(data.toml));
  $('#copy-json').addEventListener('click', () => data?.installationReady && copy(JSON.stringify(data.config, null, 2)));
  $('#copy-prompt').addEventListener('click', () => copy('使用 cocos_status 检查连接；通过 cocos_catalog 查找操作并按需读取参数；先观察当前场景，再批量执行修改。失败后检查已完成步骤，不要重放整个批次；完成后验证并保存。'));
  select(selected); refresh();
  const timer = setInterval(() => { if (!root.ownerDocument.hidden) refresh(); }, 3000);
  this.dispose = () => { closed = true; clearInterval(timer); clearInterval(buildTimer); };
};
exports.close = function () { this.dispose?.(); };
