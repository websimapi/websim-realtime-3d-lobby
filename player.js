import * as THREE from 'three';

export class Player {
    constructor(sceneManager, id, data, isLocal, avatarUrl) {
        this.sceneManager = sceneManager;
        this.id = id;
        this.isLocal = isLocal;
        this.avatarUrl = avatarUrl;
        
        // State
        this.targetPos = new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0);
        this.currentPos = this.targetPos.clone();
        this.speed = 5.0;
        this.moving = false;
        
        // Visuals
        this.mesh = new THREE.Group();
        this.sceneManager.scene.add(this.mesh);
        
        // Body (Capsule)
        const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
        this.material = new THREE.MeshStandardMaterial({ color: data.color || 0xff0000 });
        this.body = new THREE.Mesh(geometry, this.material);
        this.body.position.y = 1; // Half height + radius
        this.body.castShadow = true;
        this.body.receiveShadow = true;
        this.mesh.add(this.body);

        // Face / Direction Indicator
        const faceGeo = new THREE.BoxGeometry(0.4, 0.2, 0.2);
        const faceMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const face = new THREE.Mesh(faceGeo, faceMat);
        face.position.set(0, 1.5, 0.4); // Front of head
        this.mesh.add(face);
        
        // UI Label
        this.createLabel(data.displayName, avatarUrl);
        
        // Initial set
        this.mesh.position.copy(this.currentPos);
    }

    createLabel(name, avatarUrl) {
        this.labelDiv = document.createElement('div');
        this.labelDiv.className = 'player-label';
        
        const img = document.createElement('img');
        img.className = 'player-avatar';
        img.src = avatarUrl || 'https://via.placeholder.com/32';
        this.labelDiv.appendChild(img);
        
        const nameSpan = document.createElement('div');
        nameSpan.className = 'player-name';
        nameSpan.innerText = name || 'Player';
        this.labelDiv.appendChild(nameSpan);
        
        this.bubbleDiv = document.createElement('div');
        this.bubbleDiv.className = 'speech-bubble';
        this.bubbleDiv.style.display = 'none';
        
        // Prepend bubble so it's on top
        this.labelDiv.insertBefore(this.bubbleDiv, img);

        document.getElementById('labels-container').appendChild(this.labelDiv);
    }

    sync(data) {
        // Update color
        if (data.color && this.material.color.getHex() !== Math.floor(data.color)) {
            this.material.color.setHex(data.color);
        }

        // Update Label
        const nameSpan = this.labelDiv.querySelector('.player-name');
        if (nameSpan && data.displayName && nameSpan.innerText !== data.displayName) {
            nameSpan.innerText = data.displayName;
        }

        if (this.isLocal) {
            // If local, we control movement logic, but we might want to validate
        } else {
            // Remote player interpolation target
            this.targetPos.set(data.x, data.y, data.z);
            // If the jump from current to target is huge, teleport
            if (this.mesh.position.distanceTo(this.targetPos) > 10) {
                this.mesh.position.copy(this.targetPos);
            }
            
            // Sync action
            if (data.action === 'wave') {
                this.jump(); // Reuse jump anim for wave for now
            }
        }
    }

    setTarget(point) {
        if (!this.isLocal) return;
        this.targetPos.set(point.x, point.y, point.z);
        this.moving = true;
    }

    update(delta) {
        // Movement Logic
        const dist = this.mesh.position.distanceTo(this.targetPos);
        
        if (dist > 0.1) {
            const dir = new THREE.Vector3().subVectors(this.targetPos, this.mesh.position).normalize();
            const moveAmt = this.speed * delta;
            
            if (moveAmt > dist) {
                this.mesh.position.copy(this.targetPos);
                this.moving = false;
            } else {
                this.mesh.position.add(dir.multiplyScalar(moveAmt));
                this.moving = true;
            }
            
            // Rotate to face target
            // Use Math.atan2 for Y rotation
            const angle = Math.atan2(dir.x, dir.z);
            // Smooth rotation
            const currentRot = this.mesh.rotation.y;
            // Shortest path angle interpolation could go here, but simple set is fine for testing
            this.mesh.rotation.y = angle;
        } else {
            this.moving = false;
        }
        
        // Bobbing animation if moving
        if (this.moving) {
            this.body.position.y = 1 + Math.sin(Date.now() * 0.015) * 0.1;
        } else {
            this.body.position.y = 1;
        }

        // Update Network State if Local
        if (this.isLocal) {
            this.sceneManager.game.networking.updateMyPosition(
                this.mesh.position, 
                this.targetPos, 
                this.moving
            );
        }

        // Update Label Position
        this.updateLabelPosition();
    }

    updateLabelPosition() {
        if (!this.labelDiv) return;

        const pos = this.mesh.position.clone();
        pos.y += 2.2; // Above head

        // Project to screen
        pos.project(this.sceneManager.camera);

        const x = (pos.x * .5 + .5) * window.innerWidth;
        const y = (pos.y * -.5 + .5) * window.innerHeight;

        // Hide if behind camera
        if (pos.z > 1) {
            this.labelDiv.style.opacity = 0;
        } else {
            this.labelDiv.style.opacity = 1;
            this.labelDiv.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
        }
    }

    showBubble(text) {
        if (!this.bubbleDiv) return;
        this.bubbleDiv.innerText = text;
        this.bubbleDiv.style.display = 'block';
        
        if (this.bubbleTimeout) clearTimeout(this.bubbleTimeout);
        this.bubbleTimeout = setTimeout(() => {
            this.bubbleDiv.style.display = 'none';
        }, 3000);
    }
    
    jump() {
        // Simple jump tween or physics impulse
        let velY = 0.2;
        const startY = this.body.position.y;
        
        const animateJump = () => {
            this.body.position.y += velY;
            velY -= 0.02; // Gravity
            if (this.body.position.y <= startY) {
                this.body.position.y = startY;
            } else {
                requestAnimationFrame(animateJump);
            }
        };
        animateJump();
    }

    dispose() {
        this.sceneManager.scene.remove(this.mesh);
        if (this.labelDiv && this.labelDiv.parentNode) {
            this.labelDiv.parentNode.removeChild(this.labelDiv);
        }
        this.mesh.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
    }
}