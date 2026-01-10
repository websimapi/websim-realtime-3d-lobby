import * as THREE from 'three';
import { Player } from './player.js';

export class SceneManager {
    constructor(game) {
        this.game = game;
        this.container = document.getElementById('game-container');
        this.players = {}; // Map of clientId -> Player instance
        this.sharedObjects = {}; // Map of id -> Mesh
        
        // Raycaster for movement
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        
        this.particles = [];
    }

    init() {
        // Setup ThreeJS
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222222);
        this.scene.fog = new THREE.Fog(0x222222, 10, 50);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 8, 8);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // Lights
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 7);
        dirLight.castShadow = true;
        dirLight.shadow.camera.top = 10;
        dirLight.shadow.camera.bottom = -10;
        dirLight.shadow.camera.left = -10;
        dirLight.shadow.camera.right = 10;
        this.scene.add(dirLight);

        // Ground
        const groundMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshStandardMaterial({ 
                color: 0x333333,
                roughness: 0.8,
                metalness: 0.2
            })
        );
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);
        this.ground = groundMesh;

        // Grid
        const grid = new THREE.GridHelper(100, 50, 0x444444, 0x333333);
        this.scene.add(grid);

        // Inputs
        window.addEventListener('resize', this.onWindowResize.bind(this));
        
        // Tap to move
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    }

    createLocalPlayer() {
        // Already handled by Player class update logic if ID matches?
        // Actually, we manage all players via updatePeers, including self.
        // But we need a reference to self to control input.
    }

    updatePeers(presence) {
        const myId = this.game.networking.room.clientId;
        const currentIds = Object.keys(presence);

        // Remove disconnected
        for (const id in this.players) {
            if (!presence[id]) {
                this.players[id].dispose();
                delete this.players[id];
            }
        }

        // Add/Update
        for (const id of currentIds) {
            const data = presence[id] || {};
            
            // Check if we need to get avatar info from peers object
            const peerInfo = this.game.networking.room.peers[id];
            const avatarUrl = peerInfo ? peerInfo.avatarUrl : null;
            
            if (!this.players[id]) {
                const isLocal = (id === myId);
                this.players[id] = new Player(this, id, data, isLocal, avatarUrl);
                
                if (isLocal) {
                    this.localPlayer = this.players[id];
                }
            }
            
            // Sync data
            if (this.players[id]) {
                this.players[id].sync(data);
            }
        }
    }

    updateSharedObjects(roomState) {
        const objects = roomState.objectPositions || {};
        
        // Remove
        for (const id in this.sharedObjects) {
            if (!objects[id]) {
                this.scene.remove(this.sharedObjects[id]);
                delete this.sharedObjects[id];
            }
        }

        // Add/Update
        for (const id in objects) {
            const data = objects[id];
            if (!data) continue;

            if (!this.sharedObjects[id]) {
                const geo = new THREE.BoxGeometry(1, 1, 1);
                const mat = new THREE.MeshStandardMaterial({ color: data.color });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                this.sharedObjects[id] = mesh;
            }

            const mesh = this.sharedObjects[id];
            // Simple interpolation could go here, snapping for now
            mesh.position.set(data.x, data.y, data.z);
        }
    }

    onPointerDown(event) {
        if (!this.localPlayer) return;

        // Calculate pointer position in normalized device coordinates
        this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);

        const intersects = this.raycaster.intersectObject(this.ground);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            
            // Show tap indicator
            this.spawnTapIndicator(point);
            
            // Move local player
            this.localPlayer.setTarget(point);
            
            // Play sound
            this.playSound('tap');
        }
    }

    spawnTapIndicator(pos) {
        const geo = new THREE.RingGeometry(0.3, 0.4, 16);
        const mat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.8,
            side: THREE.DoubleSide 
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.position.y += 0.05;
        mesh.rotation.x = -Math.PI / 2;
        this.scene.add(mesh);

        // Animate and remove
        const startTime = Date.now();
        const duration = 500;
        
        const animateRing = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed > duration) {
                this.scene.remove(mesh);
                geo.dispose();
                mat.dispose();
                return;
            }
            
            const progress = elapsed / duration;
            const scale = 1 + progress;
            mesh.scale.set(scale, scale, scale);
            mat.opacity = 1 - progress;
            
            requestAnimationFrame(animateRing);
        };
        animateRing();
    }

    spawnParticle(x, y, z, color) {
        const geo = new THREE.SphereGeometry(0.1, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        
        for(let i=0; i<8; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5 + 5,
                (Math.random() - 0.5) * 5
            );
            
            this.scene.add(mesh);
            this.particles.push({ mesh, vel, life: 1.0 });
        }
    }

    playSound(type) {
        // Simple synth sound
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (type === 'tap') {
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        }
    }

    update(delta) {
        // Update players
        for (const id in this.players) {
            this.players[id].update(delta);
        }

        // Camera follow local player
        if (this.localPlayer) {
            const targetPos = this.localPlayer.mesh.position.clone();
            targetPos.y += 0; // Look at center
            
            const offset = new THREE.Vector3(0, 8, 8); // Camera offset
            const desiredPos = targetPos.clone().add(offset);
            
            this.camera.position.lerp(desiredPos, delta * 3);
            this.camera.lookAt(targetPos);
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= delta;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
                continue;
            }
            p.mesh.position.addScaledVector(p.vel, delta);
            p.vel.y -= 9.8 * delta; // Gravity
        }

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}