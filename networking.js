export class GameNetworking {
    constructor(game) {
        this.game = game;
        this.room = new WebsimSocket();
        this.peers = {};
        this.updateInterval = 1000 / 20; // 20hz update rate
        this.lastUpdate = 0;
        
        // Local state to sync
        this.myState = {
            x: 0,
            y: 0,
            z: 0,
            targetX: 0,
            targetZ: 0,
            moving: false,
            color: Math.random() * 0xffffff,
            displayName: "Player",
            action: "idle" // idle, run, wave
        };
    }

    async init() {
        await this.room.initialize();
        
        // 1. Calculate Display Name (Handle duplicates)
        this.setupIdentity();

        // 2. Initial presence update
        this.room.updatePresence(this.myState);

        // 3. Subscribe to Presence (Other players)
        this.room.subscribePresence((presence) => {
            this.game.scene.updatePeers(presence);
            this.game.ui.updatePeerCount(Object.keys(presence).length);
        });

        // 4. Subscribe to Room State (Shared Objects)
        this.room.subscribeRoomState((state) => {
            this.game.scene.updateSharedObjects(state);
        });

        // 5. Subscribe to Presence Update Requests (Interactions like 'poke')
        this.room.subscribePresenceUpdateRequests((req, fromId) => {
            this.handleRequest(req, fromId);
        });

        // 6. Handle Ephemeral Events (Chat, Particles)
        this.room.onmessage = (event) => {
            this.handleEvent(event.data);
        };

        // Log connection
        console.log("Connected as client:", this.room.clientId);
    }

    setupIdentity() {
        const myId = this.room.clientId;
        const myInfo = this.room.peers[myId];
        const baseName = myInfo.username;
        
        // Find collisions
        const allPeers = Object.values(this.room.peers);
        
        // Sort peers by ID to have deterministic ordering
        allPeers.sort((a, b) => a.id.localeCompare(b.id));
        
        // Filter for my username
        const nameCollisions = allPeers.filter(p => p.username === baseName);
        
        if (nameCollisions.length > 1) {
            const myIndex = nameCollisions.findIndex(p => p.id === myId);
            if (myIndex > 0) {
                // I am a guest
                this.myState.displayName = `${baseName} (Guest ${myIndex})`;
            } else {
                this.myState.displayName = baseName;
            }
        } else {
            this.myState.displayName = baseName;
        }

        console.log("Identity established:", this.myState.displayName);
    }

    update(delta) {
        // Rate limit updates
        const now = performance.now();
        if (now - this.lastUpdate > this.updateInterval) {
            this.broadcastMyState();
            this.lastUpdate = now;
        }
    }

    updateMyPosition(position, target, moving) {
        this.myState.x = position.x;
        this.myState.y = position.y;
        this.myState.z = position.z;
        this.myState.targetX = target.x;
        this.myState.targetZ = target.z;
        this.myState.moving = moving;
        
        // We don't force update here, update(delta) handles the loop
    }
    
    updateMyAction(actionName) {
        this.myState.action = actionName;
        // Force immediate update for actions to ensure responsiveness
        this.room.updatePresence({ action: actionName });
        
        // Reset action after short delay if it's a trigger
        if(actionName === 'wave') {
            setTimeout(() => {
                this.myState.action = 'idle';
                this.room.updatePresence({ action: 'idle' });
            }, 1000);
        }
    }

    updateMyColor() {
        this.myState.color = Math.random() * 0xffffff;
        this.room.updatePresence({ color: this.myState.color });
        return this.myState.color;
    }

    broadcastMyState() {
        // Send current state
        this.room.updatePresence(this.myState);
    }

    // --- Interactive Features ---

    spawnBox() {
        // Add a shared object to roomState
        const id = `box-${Date.now()}`;
        const x = this.myState.x + (Math.random() - 0.5) * 4;
        const z = this.myState.z + (Math.random() - 0.5) * 4;
        
        // We merge with existing objectPositions
        const currentObjects = this.room.roomState.objectPositions || {};
        
        // Clean up old boxes if too many (> 10)
        const keys = Object.keys(currentObjects);
        if (keys.length >= 10) {
            this.room.updateRoomState({
                objectPositions: { [keys[0]]: null } // Delete oldest
            });
        }

        this.room.updateRoomState({
            objectPositions: {
                [id]: { x, y: 1, z, color: Math.random() * 0xffffff }
            }
        });
        
        this.sendEvent("spawn_poof", { x, y: 1, z });
    }

    sendWave() {
        this.updateMyAction("wave");
        this.sendEvent("emote", { emoji: "👋", x: this.myState.x, y: 2, z: this.myState.z });
    }

    sendEvent(type, data) {
        this.room.send({
            type,
            clientId: this.room.clientId,
            username: this.myState.displayName,
            ...data
        });
    }

    handleEvent(data) {
        switch (data.type) {
            case "emote":
                this.game.ui.showBubble(data.clientId, data.emoji);
                this.game.ui.log(`${data.username} waved!`);
                this.game.scene.spawnParticle(data.x, data.y, data.z, 0xffff00);
                break;
            case "spawn_poof":
                this.game.scene.spawnParticle(data.x, data.y, data.z, 0xffffff);
                break;
            case "sfx":
                // Play sound if requested
                break;
        }
    }

    handleRequest(req, fromId) {
        if (req.type === "poke") {
            this.game.ui.log(`You were poked by ${this.room.peers[fromId].username}!`);
            // React to poke: jump slightly
            this.game.scene.localPlayer.jump();
            this.sendEvent("emote", { emoji: "❗", x: this.myState.x, y: 2, z: this.myState.z });
        }
    }
}