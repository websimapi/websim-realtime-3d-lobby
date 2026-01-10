import * as THREE from 'three';
import { GameNetworking } from './networking.js';
import { SceneManager } from './scene.js';
import { UIManager } from './ui.js';

class Game {
    constructor() {
        this.networking = new GameNetworking(this);
        this.scene = new SceneManager(this);
        this.ui = new UIManager(this);
        this.lastTime = 0;
        
        this.init();
    }

    async init() {
        this.ui.updateStatus("Connecting to Websim...");
        
        // Initialize networking
        await this.networking.init();
        
        this.ui.updateStatus("Connected. Initializing Scene...");
        
        // Initialize Scene
        this.scene.init();

        // Start Loop
        requestAnimationFrame(this.animate.bind(this));
        
        this.ui.updateStatus("Ready");
        this.ui.log("Welcome to the lobby!");
    }

    animate(time) {
        requestAnimationFrame(this.animate.bind(this));
        
        const delta = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.scene.update(delta);
        this.networking.update(delta); // Send batched updates if needed
    }
}

// Start the game
window.game = new Game();