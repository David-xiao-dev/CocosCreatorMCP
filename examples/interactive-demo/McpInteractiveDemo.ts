import { _decorator, Component, Label, Node, Button, Graphics, Color, UITransform, view, Canvas, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

/** All references and Button events are configured through the MCP, not find(). */
@ccclass('McpInteractiveDemo')
export class McpInteractiveDemo extends Component {
    @property(Label) statusLabel: Label | null = null;
    @property(Node) settingsPanel: Node | null = null;
    @property(Node) inventoryPanel: Node | null = null;
    @property([Node]) actionButtons: Node[] = [];
    private clicks = 0;
    private viewport = '';

    update() {
        const size = view.getVisibleSize();
        // Creator's preview toolbar may keep a fixed 1280px canvas wider than
        // its window. Account for the actually visible browser area as well.
        const canvas = typeof document === 'undefined' ? null : document.getElementById('GameCanvas');
        const rect = canvas?.getBoundingClientRect();
        const width = size.width * (rect ? Math.min(1, window.innerWidth / rect.width) : 1);
        const height = size.height * (rect ? Math.min(1, (window.innerHeight - Math.max(0, rect.y)) / rect.height) : 1);
        const key = `${width}:${height}`;
        if (key !== this.viewport) {
            this.viewport = key;
            const scale = Math.min(1, width / 960, height / 640);
            this.node.setScale(scale, scale, 1);
        }
        this.publishClickTargets();
    }

    private publishClickTargets() {
        if (typeof document === 'undefined') return;
        const evidence = document.getElementById('mcp-demo-evidence');
        const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement | null;
        const camera = this.node.parent?.getComponent(Canvas)?.cameraComponent;
        if (!evidence || !canvas || !camera) return;
        const rect = canvas.getBoundingClientRect();
        const buttons: { name: string; x: number; y: number }[] = [];
        const visit = (node: Node) => {
            if (!node.activeInHierarchy) return;
            const ui = node.getComponent(UITransform);
            if (node.getComponent(Button) && ui) {
                const point = camera.worldToScreen(ui.convertToWorldSpaceAR(new Vec3()));
                buttons.push({ name: node.name, x: rect.x + point.x / canvas.width * rect.width, y: rect.y + (1 - point.y / canvas.height) * rect.height });
            }
            node.children.forEach(visit);
        };
        visit(this.node);
        evidence.dataset.clickTargets = JSON.stringify(buttons);
    }

    start() {
        const draw = (node: Node) => {
            const ui = node.getComponent(UITransform);
            if (ui && (node.getComponent(Button) || node.name.endsWith('Panel') || node.name.startsWith('Slot'))) {
                const g = node.getComponent(Graphics) || node.addComponent(Graphics);
                g.fillColor = node.getComponent(Button) ? new Color(46, 108, 235, 255) : new Color(27, 40, 65, 255);
                g.roundRect(-ui.width / 2, -ui.height / 2, ui.width, ui.height, 12);
                g.fill();
            }
            node.children.forEach(draw);
        };
        draw(this.node);
        this.closePanels();
        this.show('Ready · click a button');
    }

    onPlay() { this.clicks++; this.closePanels(); this.show(`Playing · score ${this.clicks}`); }
    onSettings() { this.closePanels(); if (this.settingsPanel) this.settingsPanel.active = true; this.show('Settings opened'); }
    onInventory() { this.closePanels(); if (this.inventoryPanel) this.inventoryPanel.active = true; this.show('Inventory opened · 6 slots'); }
    onBack() { this.closePanels(); this.show('Ready · back to menu'); }

    private closePanels() {
        if (this.settingsPanel) this.settingsPanel.active = false;
        if (this.inventoryPanel) this.inventoryPanel.active = false;
    }
    private show(value: string) {
        if (this.statusLabel) this.statusLabel.string = value;
        // Optional test-only DOM evidence for browser automation; never required
        // for gameplay and deliberately enabled only by an explicit URL flag.
        if (typeof document !== 'undefined' && /[?&]mcp-test=1(?:&|$)/.test(location.search)) {
            let evidence = document.getElementById('mcp-demo-evidence');
            if (!evidence) {
                evidence = document.createElement('output'); evidence.id = 'mcp-demo-evidence';
                evidence.setAttribute('aria-label', 'MCP demo runtime evidence');
                Object.assign(evidence.style, { position: 'fixed', bottom: '2px', left: '4px', color: '#8bd', font: '12px monospace', pointerEvents: 'none' });
                document.body.appendChild(evidence);
            }
            evidence.textContent = `${value} | boundButtons=${this.actionButtons.length}`;
        }
    }
}
