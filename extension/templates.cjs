'use strict';
const label = (name, text, x, y, size = 28) => ({ name, position: { x, y, z: 0 }, size: { width: 400, height: 60 }, components: [{ type: 'cc.Label', properties: { string: text, fontSize: size, lineHeight: size + 8, horizontalAlign: 1, verticalAlign: 1 } }] });
const templates = {
  menu: { title: '主菜单 / Main menu', description: '标题、开始按钮和说明文字；按钮事件由项目脚本绑定。', tree: {
    name: 'MainMenu', size: { width: 720, height: 960 }, children: [
      label('Title', 'YOUR GAME', 0, 160, 48),
      { ...label('StartButton', '开始游戏 / START', 0, 0, 30), components: [
        { type: 'cc.Label', properties: { string: '开始游戏 / START', fontSize: 30, lineHeight: 40, horizontalAlign: 1, verticalAlign: 1 } }, { type: 'cc.Button', properties: { interactable: true } },
      ] }, label('Hint', '使用项目脚本绑定按钮事件', 0, -100, 20),
    ],
  } },
  dialog: { title: '确认弹窗 / Dialog', description: '弹窗标题、正文和确认/取消按钮；不自动接入业务逻辑。', tree: {
    name: 'ConfirmDialog', size: { width: 640, height: 400 }, children: [
      label('Title', '确认操作', 0, 130, 32), label('Body', '在这里填写提示内容', 0, 30, 24),
      { ...label('Confirm', '确认', -130, -100, 26), size: { width: 200, height: 60 }, components: [{ type: 'cc.Label', properties: { string: '确认', fontSize: 26, horizontalAlign: 1, verticalAlign: 1 } }, { type: 'cc.Button' }] },
      { ...label('Cancel', '取消', 130, -100, 26), size: { width: 200, height: 60 }, components: [{ type: 'cc.Label', properties: { string: '取消', fontSize: 26, horizontalAlign: 1, verticalAlign: 1 } }, { type: 'cc.Button' }] },
    ],
  } },
  hud: { title: '游戏状态栏 / HUD', description: '积分、生命值和暂停按钮，适合作为游戏 UI 起点。', tree: {
    name: 'HUD', size: { width: 720, height: 960 }, children: [
      label('Score', 'SCORE  0000', -170, 400, 24), label('Health', 'HP  100', 170, 400, 24),
      { ...label('Pause', '暂停', 260, -400, 24), size: { width: 120, height: 60 }, components: [{ type: 'cc.Label', properties: { string: '暂停', fontSize: 24, horizontalAlign: 1, verticalAlign: 1 } }, { type: 'cc.Button' }] },
    ],
  } },
};
module.exports = templates;
