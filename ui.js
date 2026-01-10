export class UIManager {
    constructor(game) {
        this.game = game;
        
        // Elements
        this.peerCountEl = document.getElementById('peer-count');
        this.statusEl = document.getElementById('status');
        this.logContainer = document.getElementById('log-container');
        
        // Buttons
        document.getElementById('btn-poke').onclick = () => {
            this.game.networking.sendWave();
        };
        
        document.getElementById('btn-color').onclick = () => {
            const color = this.game.networking.updateMyColor();
            // Optimistically update local player visual
            if (this.game.scene.localPlayer) {
                this.game.scene.localPlayer.material.color.setHex(color);
            }
        };
        
        document.getElementById('btn-spawn').onclick = () => {
            this.game.networking.spawnBox();
        };
    }

    updatePeerCount(count) {
        this.peerCountEl.innerText = count;
    }

    updateStatus(text) {
        this.statusEl.innerText = text;
    }

    log(msg) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerText = `> ${msg}`;
        this.logContainer.prepend(div);
        
        // Prune
        if (this.logContainer.children.length > 10) {
            this.logContainer.lastChild.remove();
        }
    }

    showBubble(clientId, text) {
        const player = this.game.scene.players[clientId];
        if (player) {
            player.showBubble(text);
        }
    }
}