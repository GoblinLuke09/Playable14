import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Load audio assets
        try {
            this.load.audio('sfx_click', 'src/assets/Sound/click.mp3');
            this.load.audio('sfx_complete', 'src/assets/Sound/levelcomplete.mp3');
            this.load.audio('sfx_gameover', 'src/assets/Sound/gameover.mp3');
        } catch (e) {
            console.warn('Audio preload fallback', e);
        }
    }

    create() {
        this.w = this.scale.width;
        this.h = this.scale.height;
        this.centerX = this.w / 2;
        this.roadWidth = Math.min(this.w * 0.85, 380);
        this.roadLeft = this.centerX - this.roadWidth / 2;
        this.roadRight = this.centerX + this.roadWidth / 2;

        this.gameState = 'TUTORIAL'; // TUTORIAL, RUNNING, BOSS_FIGHT, ENDCARD
        this.crowdCount = 1;
        this.playerX = this.centerX;
        this.targetPlayerX = this.centerX;
        this.playerY = this.h * 0.76;
        this.scrollSpeed = 260; // Pixels per second
        this.distanceTravelled = 0;
        this.bossHp = 100;
        this.maxBossHp = 100;
        this.isInteracted = false;
        this.hasTriggeredStore = false;

        this.generateTextures();
        this.createBackgroundAndRoad();
        this.createTrackElements();
        this.createCrowd();
        this.createBoss();
        this.createUI();
        this.setupInput();

        // Notify Playturbo / Networks
        if (typeof window.gameReady === 'function') {
            window.gameReady();
        }

        // Auto-pilot if no touch after 3s to guarantee ad progression
        this.autoPilotTimer = this.time.delayedCall(3000, () => {
            if (!this.isInteracted && this.gameState === 'TUTORIAL') {
                this.startGame();
                this.tweens.add({
                    targets: this,
                    targetPlayerX: this.centerX - 80,
                    duration: 1000,
                    ease: 'Power2'
                });
            }
        });
    }

    drawRoundRect(ctx, x, y, w, h, r) {
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }
    }

    generateTextures() {
        // 1. Blue Runner Stickman Texture
        if (!this.textures.exists('runner_blue')) {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 36;
            const ctx = canvas.getContext('2d');

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.ellipse(16, 33, 10, 3, 0, 0, Math.PI * 2);
            ctx.fill();

            // Body gradient (Bright Blue)
            const grad = ctx.createLinearGradient(0, 0, 0, 32);
            grad.addColorStop(0, '#00d4ff');
            grad.addColorStop(1, '#0066ff');

            // Head
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(16, 9, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(16, 9, 6, 0, Math.PI * 2);
            ctx.fill();

            // Body
            ctx.fillStyle = grad;
            ctx.beginPath();
            this.drawRoundRect(ctx, 11, 15, 10, 14, 4);
            ctx.fill();

            // Headband / Eyes glow
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(13, 7, 6, 2);

            this.textures.addCanvas('runner_blue', canvas);
        }

        // 2. Red Giant Boss Texture
        if (!this.textures.exists('boss_red')) {
            const canvas = document.createElement('canvas');
            canvas.width = 96;
            canvas.height = 110;
            const ctx = canvas.getContext('2d');

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.beginPath();
            ctx.ellipse(48, 102, 34, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Red fiery gradient
            const bGrad = ctx.createLinearGradient(0, 0, 0, 100);
            bGrad.addColorStop(0, '#ff4757');
            bGrad.addColorStop(1, '#9b0000');

            // Horns
            ctx.fillStyle = '#ffa502';
            ctx.beginPath();
            ctx.moveTo(30, 26);
            ctx.lineTo(16, 8);
            ctx.lineTo(36, 18);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(66, 26);
            ctx.lineTo(80, 8);
            ctx.lineTo(60, 18);
            ctx.fill();

            // Head
            ctx.fillStyle = bGrad;
            ctx.beginPath();
            ctx.arc(48, 32, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#2f3542';
            ctx.stroke();

            // Evil Eyes
            ctx.fillStyle = '#ffa502';
            ctx.beginPath();
            ctx.arc(40, 28, 5, 0, Math.PI * 2);
            ctx.arc(56, 28, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(40, 28, 2, 0, Math.PI * 2);
            ctx.arc(56, 28, 2, 0, Math.PI * 2);
            ctx.fill();

            // Big muscular body
            ctx.fillStyle = bGrad;
            ctx.beginPath();
            this.drawRoundRect(ctx, 24, 50, 48, 48, 12);
            ctx.fill();
            ctx.stroke();

            // Spiked Shoulders
            ctx.fillStyle = '#2f3542';
            ctx.beginPath();
            ctx.arc(20, 56, 10, 0, Math.PI * 2);
            ctx.arc(76, 56, 10, 0, Math.PI * 2);
            ctx.fill();

            this.textures.addCanvas('boss_red', canvas);
        }

        // 3. Saw / Blade Hazard Texture
        if (!this.textures.exists('saw_blade')) {
            const canvas = document.createElement('canvas');
            canvas.width = 48;
            canvas.height = 48;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#747d8c';
            ctx.beginPath();
            ctx.arc(24, 24, 20, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ff4757';
            ctx.beginPath();
            ctx.arc(24, 24, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI) / 4;
                ctx.beginPath();
                ctx.moveTo(24, 24);
                ctx.lineTo(24 + Math.cos(angle) * 22, 24 + Math.sin(angle) * 22);
                ctx.stroke();
            }

            this.textures.addCanvas('saw_blade', canvas);
        }

        // 4. Particle star
        if (!this.textures.exists('star_particle')) {
            const canvas = document.createElement('canvas');
            canvas.width = 16;
            canvas.height = 16;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffeaa7';
            ctx.beginPath();
            ctx.arc(8, 8, 7, 0, Math.PI * 2);
            ctx.fill();
            this.textures.addCanvas('star_particle', canvas);
        }
    }

    createBackgroundAndRoad() {
        // Dynamic futuristic gradient background
        this.bgGraphics = this.add.graphics();
        this.bgGraphics.fillGradientStyle(0x0f172a, 0x0f172a, 0x1e293b, 0x1e293b, 1);
        this.bgGraphics.fillRect(0, 0, this.w, this.h);

        // Road Surface Container
        this.roadGraphics = this.add.graphics();
        this.drawRoad();

        // Animated Speed lines / Grid on road
        this.roadStripes = [];
        for (let i = 0; i < 14; i++) {
            const stripe = this.add.rectangle(
                this.centerX,
                i * 70,
                this.roadWidth * 0.9,
                4,
                0xffffff,
                0.08
            );
            this.roadStripes.push(stripe);
        }
    }

    drawRoad() {
        this.roadGraphics.clear();

        // Outer Glow / Road Border
        this.roadGraphics.lineStyle(6, 0x38bdf8, 0.6);
        this.roadGraphics.strokeRoundedRect(this.roadLeft - 2, -50, this.roadWidth + 4, this.h + 100, 16);

        // Road Bed
        this.roadGraphics.fillStyle(0x1e1b4b, 0.95);
        this.roadGraphics.fillRoundedRect(this.roadLeft, -50, this.roadWidth, this.h + 100, 14);

        // Lane divider (dashed)
        this.roadGraphics.lineStyle(2, 0x6366f1, 0.25);
        this.roadGraphics.lineBetween(this.centerX, 0, this.centerX, this.h);
    }

    createTrackElements() {
        // Track layout along virtual Y coordinates (distance)
        // Gate Set 1: Choice between (+20) and (-10)
        this.gateSet1 = {
            y: -380,
            passed: false,
            left: { x: this.centerX - this.roadWidth * 0.25, type: 'ADD', val: 20, color: 0x10b981, label: '+20' },
            right: { x: this.centerX + this.roadWidth * 0.25, type: 'SUB', val: -10, color: 0xef4444, label: '-10' }
        };

        // Mid Hazard Saw
        this.sawHazard = {
            y: -850,
            x: this.centerX,
            sprite: this.add.sprite(this.centerX, -850, 'saw_blade').setScale(1.2)
        };

        // Gate Set 2: Choice between (x5 Multiplier) and (+10)
        this.gateSet2 = {
            y: -1300,
            passed: false,
            left: { x: this.centerX - this.roadWidth * 0.25, type: 'MULT', val: 5, color: 0xf59e0b, label: 'x5' },
            right: { x: this.centerX + this.roadWidth * 0.25, type: 'ADD', val: 10, color: 0x3b82f6, label: '+10' }
        };

        // Finish Line
        this.finishLineY = -1800;
        this.finishLineGraphic = this.add.graphics();
        this.drawFinishLine();

        // Visual Gate GameObjects
        this.gateContainers = [];
        this.gateContainers.push(this.buildGateVisual(this.gateSet1.left, this.gateSet1.y));
        this.gateContainers.push(this.buildGateVisual(this.gateSet1.right, this.gateSet1.y));
        this.gateContainers.push(this.buildGateVisual(this.gateSet2.left, this.gateSet2.y));
        this.gateContainers.push(this.buildGateVisual(this.gateSet2.right, this.gateSet2.y));
    }

    buildGateVisual(gateData, initialY) {
        const container = this.add.container(gateData.x, initialY);
        const w = this.roadWidth * 0.44;
        const h = 75;

        // Gate frame glow
        const bg = this.add.graphics();
        bg.fillStyle(gateData.color, 0.25);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
        bg.lineStyle(3, gateData.color, 0.9);
        bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);

        // Top Light Bar
        const bar = this.add.rectangle(0, -h / 2 + 4, w - 8, 4, 0xffffff, 0.8);

        // Text
        const text = this.add.text(0, 0, gateData.label, {
            fontSize: '30px',
            fontFamily: 'Arial Black, Impact, sans-serif',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(0.5);

        // Subtitle tag
        const sub = this.add.text(0, h / 2 - 12, gateData.type === 'MULT' ? 'SUPER' : 'CROWD', {
            fontSize: '11px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        container.add([bg, bar, text, sub]);
        container.gateData = gateData;
        return container;
    }

    drawFinishLine() {
        this.finishLineGraphic.clear();
        const flY = this.finishLineY + this.distanceTravelled;
        const w = this.roadWidth;
        const h = 24;
        const sq = 12;

        // Checkered pattern
        for (let x = 0; x < w; x += sq) {
            const isWhite = (Math.floor(x / sq)) % 2 === 0;
            this.finishLineGraphic.fillStyle(isWhite ? 0xffffff : 0x000000, 0.9);
            this.finishLineGraphic.fillRect(this.roadLeft + x, flY, sq, h);
        }

        // Finish text banner
        this.finishBanner = this.add.text(this.centerX, flY - 20, '🏁 FINISH BATTLE 🏁', {
            fontSize: '16px',
            fontFamily: 'Arial Black',
            color: '#facc15',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
    }

    createCrowd() {
        this.crowdContainer = this.add.container(0, 0);
        this.runners = [];
        this.updateCrowdVisuals();

        // Crowd counter floating pill
        this.countBadge = this.add.container(this.playerX, this.playerY - 45);
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.7);
        bg.fillRoundedRect(-32, -14, 64, 28, 14);
        bg.lineStyle(2, 0x38bdf8, 1);
        bg.strokeRoundedRect(-32, -14, 64, 28, 14);

        this.countText = this.add.text(0, 0, `👥 ${this.crowdCount}`, {
            fontSize: '15px',
            fontFamily: 'Arial Black',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.countBadge.add([bg, this.countText]);
    }

    updateCrowdVisuals() {
        // Manage pool of runner sprites
        const targetVisible = Math.min(this.crowdCount, 45); // Max visual sprites for optimal FPS

        while (this.runners.length < targetVisible) {
            const r = this.add.sprite(this.playerX, this.playerY, 'runner_blue');
            r.setScale(0.95);
            this.crowdContainer.add(r);
            this.runners.push(r);
        }

        while (this.runners.length > targetVisible) {
            const r = this.runners.pop();
            r.destroy();
        }

        // Layout runners in organic flock / cone around central player pos
        for (let i = 0; i < this.runners.length; i++) {
            const r = this.runners[i];
            if (i === 0) {
                r.offsetX = 0;
                r.offsetY = 0;
            } else {
                // Golden spiral / circle distribution
                const radius = Math.sqrt(i) * 9;
                const angle = i * 2.39996; // Golden angle
                r.offsetX = Math.cos(angle) * radius * 1.4;
                r.offsetY = Math.sin(angle) * radius * 0.8;
            }
        }
    }

    createBoss() {
        this.bossContainer = this.add.container(this.centerX, this.finishLineY - 140);
        this.bossSprite = this.add.sprite(0, 0, 'boss_red').setScale(1.4);

        // Boss HP Bar
        this.bossHpBg = this.add.graphics();
        this.bossHpFill = this.add.graphics();
        this.bossNameText = this.add.text(0, -90, '👹 TITAN DESTROYER', {
            fontSize: '14px',
            fontFamily: 'Arial Black',
            color: '#ff4757',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.bossHpText = this.add.text(0, -68, `${this.bossHp}/${this.maxBossHp}`, {
            fontSize: '12px',
            fontFamily: 'Arial Black',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        this.bossContainer.add([this.bossSprite, this.bossHpBg, this.bossHpFill, this.bossNameText, this.bossHpText]);
        this.updateBossHpBar();
    }

    updateBossHpBar() {
        const w = 120;
        const h = 14;
        const pct = Math.max(0, this.bossHp / this.maxBossHp);

        this.bossHpBg.clear();
        this.bossHpBg.fillStyle(0x000000, 0.7);
        this.bossHpBg.fillRoundedRect(-w / 2, -75, w, h, 6);
        this.bossHpBg.lineStyle(1.5, 0xffffff, 0.8);
        this.bossHpBg.strokeRoundedRect(-w / 2, -75, w, h, 6);

        this.bossHpFill.clear();
        this.bossHpFill.fillStyle(0xef4444, 1);
        this.bossHpFill.fillRoundedRect(-w / 2 + 1, -74, Math.max(0, (w - 2) * pct), h - 2, 5);

        this.bossHpText.setText(`HP: ${Math.max(0, Math.floor(this.bossHp))}`);
    }

    createUI() {
        // 1. Top Header
        this.topBanner = this.add.container(this.centerX, 45);
        const topBg = this.add.graphics();
        topBg.fillStyle(0x000000, 0.65);
        topBg.fillRoundedRect(-140, -22, 280, 44, 22);
        topBg.lineStyle(2, 0x38bdf8, 0.8);
        topBg.strokeRoundedRect(-140, -22, 280, 44, 22);

        this.topTitle = this.add.text(0, 0, '⚡ RUN & MULTIPLY! ⚡', {
            fontSize: '17px',
            fontFamily: 'Arial Black',
            color: '#38bdf8'
        }).setOrigin(0.5);
        this.topBanner.add([topBg, this.topTitle]);

        // 2. Tutorial Hand & Prompt
        this.tutorialGroup = this.add.container(this.centerX, this.playerY - 70);
        this.handPointer = this.add.text(0, 0, '👉', { fontSize: '42px' }).setOrigin(0.5);

        this.dragPrompt = this.add.text(0, 48, 'SWIPE TO DODGE & MULTIPLY!', {
            fontSize: '14px',
            fontFamily: 'Arial Black',
            color: '#facc15',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.tutorialGroup.add([this.handPointer, this.dragPrompt]);

        // Hand oscillation animation
        this.tweens.add({
            targets: this.handPointer,
            x: 55,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    setupInput() {
        this.input.on('pointerdown', (pointer) => {
            this.handleUserInteraction(pointer);
        });

        this.input.on('pointermove', (pointer) => {
            if (pointer.isDown) {
                this.handleUserInteraction(pointer);
            }
        });
    }

    handleUserInteraction(pointer) {
        if (this.gameState === 'ENDCARD') {
            this.ShowStore();
            return;
        }

        if (!this.isInteracted) {
            this.startGame();
        }

        // Clamp player target within road boundaries
        const margin = 28;
        this.targetPlayerX = Phaser.Math.Clamp(
            pointer.x,
            this.roadLeft + margin,
            this.roadRight - margin
        );
    }

    startGame() {
        this.isInteracted = true;
        this.gameState = 'RUNNING';

        if (typeof window.gameStart === 'function') {
            window.gameStart();
        }

        // Fade out tutorial prompt
        this.tweens.add({
            targets: this.tutorialGroup,
            alpha: 0,
            duration: 300,
            onComplete: () => this.tutorialGroup.setVisible(false)
        });

        this.playSfx('sfx_click');
    }

    playSfx(key) {
        try {
            if (this.sound && this.sound.play) {
                this.sound.play(key, { volume: 0.6 });
            }
        } catch (e) {
            // Audio context fallback
        }
    }

    update(time, delta) {
        const dt = delta / 1000;

        // Animate Road Stripes for high speed sensation
        if (this.gameState === 'RUNNING' || this.gameState === 'TUTORIAL') {
            const stripeSpeed = this.gameState === 'RUNNING' ? this.scrollSpeed : 40;
            this.roadStripes.forEach(st => {
                st.y += stripeSpeed * dt;
                if (st.y > this.h) {
                    st.y -= (14 * 70);
                }
            });
        }

        // Smooth horizontal player tracking
        this.playerX = Phaser.Math.Linear(this.playerX, this.targetPlayerX, 0.18);

        // Update Runner Positions & Bounce Animation
        const bounce = Math.sin(time * 0.018) * 3;
        for (let i = 0; i < this.runners.length; i++) {
            const r = this.runners[i];
            r.x = this.playerX + r.offsetX;
            r.y = this.playerY + r.offsetY + bounce;
            r.setDepth(10 + Math.floor(r.y));
        }

        // Update Count Badge position
        this.countBadge.x = this.playerX;
        this.countBadge.y = this.playerY - 45 - Math.sqrt(this.crowdCount) * 2;
        this.countBadge.setDepth(500);

        // Track Progression during RUNNING state
        if (this.gameState === 'RUNNING') {
            this.distanceTravelled += this.scrollSpeed * dt;

            // Rotate saw blade
            if (this.sawHazard.sprite) {
                this.sawHazard.sprite.angle += 360 * dt * 2;
                this.sawHazard.sprite.y = this.sawHazard.y + this.distanceTravelled;
            }

            // Update Gates Position
            this.gateContainers.forEach(gc => {
                gc.y = gc.gateData === this.gateSet1.left || gc.gateData === this.gateSet1.right ?
                    this.gateSet1.y + this.distanceTravelled :
                    this.gateSet2.y + this.distanceTravelled;
            });

            // Update Finish Line & Boss
            const currFinishY = this.finishLineY + this.distanceTravelled;
            this.finishLineGraphic.y = this.distanceTravelled;
            if (this.finishBanner) {
                this.finishBanner.y = this.finishLineY + this.distanceTravelled - 20;
            }
            this.bossContainer.y = currFinishY - 140;

            // Check Gate 1 Collision
            if (!this.gateSet1.passed && this.gateSet1.y + this.distanceTravelled >= this.playerY - 20) {
                this.gateSet1.passed = true;
                const chosenGate = this.playerX < this.centerX ? this.gateSet1.left : this.gateSet1.right;
                this.triggerGate(chosenGate);
            }

            // Check Gate 2 Collision
            if (!this.gateSet2.passed && this.gateSet2.y + this.distanceTravelled >= this.playerY - 20) {
                this.gateSet2.passed = true;
                const chosenGate = this.playerX < this.centerX ? this.gateSet2.left : this.gateSet2.right;
                this.triggerGate(chosenGate);
            }

            // Check Finish Line Hit -> Trigger Boss Fight
            if (currFinishY >= this.playerY - 40) {
                this.startBossFight();
            }
        } else if (this.gameState === 'BOSS_FIGHT') {
            // Boss idle menacing breathing
            this.bossSprite.scaleY = 1.4 + Math.sin(time * 0.008) * 0.06;
        }
    }

    triggerGate(gate) {
        let prevCount = this.crowdCount;
        let delta = 0;

        if (gate.type === 'ADD') {
            delta = gate.val;
            this.crowdCount = Math.max(1, this.crowdCount + delta);
        } else if (gate.type === 'SUB') {
            delta = gate.val;
            this.crowdCount = Math.max(1, this.crowdCount + delta);
        } else if (gate.type === 'MULT') {
            delta = this.crowdCount * (gate.val - 1);
            this.crowdCount = this.crowdCount * gate.val;
        }

        this.countText.setText(`👥 ${this.crowdCount}`);
        this.updateCrowdVisuals();
        this.playSfx('sfx_click');

        // Floating multiplier text
        const sign = delta >= 0 ? `+${delta}` : `${delta}`;
        const color = delta >= 0 ? '#10b981' : '#ef4444';
        const floatText = this.add.text(this.playerX, this.playerY - 80, sign, {
            fontSize: '34px',
            fontFamily: 'Arial Black',
            color: color,
            stroke: '#ffffff',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(600);

        this.tweens.add({
            targets: floatText,
            y: floatText.y - 70,
            alpha: 0,
            scale: 1.4,
            duration: 800,
            ease: 'Power2',
            onComplete: () => floatText.destroy()
        });

        // Flash screen & Camera Shake
        this.cameras.main.shake(180, 0.012);
        this.spawnConfetti(this.playerX, this.playerY - 20, 18);
    }

    spawnConfetti(x, y, count) {
        for (let i = 0; i < count; i++) {
            const p = this.add.sprite(x, y, 'star_particle');
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(80, 240);
            p.setDepth(700);
            p.setTint(Phaser.Utils.Array.GetRandom([0x38bdf8, 0xfacc15, 0x10b981, 0xff4757, 0xffffff]));

            this.tweens.add({
                targets: p,
                x: x + Math.cos(angle) * speed,
                y: y + Math.sin(angle) * speed,
                alpha: 0,
                scale: Phaser.Math.FloatBetween(0.3, 1.2),
                duration: 600,
                ease: 'Power2',
                onComplete: () => p.destroy()
            });
        }
    }

    startBossFight() {
        this.gameState = 'BOSS_FIGHT';
        this.topTitle.setText('⚔️ SMASH THE BOSS! ⚔️');

        // Runners rush towards the Boss
        const targetBossY = this.bossContainer.y + 40;
        this.runners.forEach((r, idx) => {
            this.tweens.add({
                targets: r,
                x: this.centerX + Phaser.Math.Between(-50, 50),
                y: targetBossY + Phaser.Math.Between(-10, 40),
                duration: 400 + idx * 12,
                ease: 'Power2',
                onComplete: () => {
                    this.hitBoss(2.5);
                }
            });
        });
    }

    hitBoss(damage) {
        this.bossHp -= damage;
        this.updateBossHpBar();

        // Stagger Boss
        this.bossSprite.setTint(0xffffff);
        this.time.delayedCall(60, () => {
            if (this.bossSprite) this.bossSprite.clearTint();
        });

        this.cameras.main.shake(80, 0.008);
        this.spawnConfetti(this.centerX + Phaser.Math.Between(-30, 30), this.bossContainer.y - 20, 4);

        if (this.bossHp <= 0 && this.gameState !== 'ENDCARD') {
            this.defeatBoss();
        }
    }

    defeatBoss() {
        this.gameState = 'ENDCARD';
        this.playSfx('sfx_complete');

        // Big Boss Explosion
        this.spawnConfetti(this.centerX, this.bossContainer.y, 60);
        this.cameras.main.shake(400, 0.025);

        this.tweens.add({
            targets: this.bossContainer,
            scale: 1.8,
            alpha: 0,
            duration: 600,
            ease: 'Back.easeIn',
            onComplete: () => {
                this.bossContainer.setVisible(false);
                this.showEndCard();
            }
        });
    }

    showEndCard() {
        const overlay = this.add.rectangle(this.centerX, this.h / 2, this.w, this.h, 0x000000, 0)
            .setInteractive()
            .setDepth(1000);

        this.tweens.add({
            targets: overlay,
            fillAlpha: 0.85,
            duration: 500
        });

        overlay.on('pointerdown', () => this.ShowStore());

        // End Card Container
        const card = this.add.container(this.centerX, this.h / 2).setDepth(1001);

        // Victory Ribbon / Text
        const victoryText = this.add.text(0, -180, '🏆 VICTORY! 🏆', {
            fontSize: '36px',
            fontFamily: 'Arial Black',
            color: '#facc15',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        const subText = this.add.text(0, -130, 'YOU ARE THE RUN MASTER!', {
            fontSize: '16px',
            fontFamily: 'Arial Black',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Stars
        const starGroup = this.add.container(0, -75);
        for (let i = -1; i <= 1; i++) {
            const star = this.add.text(i * 50, 0, '⭐', { fontSize: '38px' }).setOrigin(0.5);
            star.setScale(0);
            this.tweens.add({
                targets: star,
                scale: i === 0 ? 1.3 : 1.0,
                duration: 500,
                delay: 200 + Math.abs(i) * 150,
                ease: 'Back.easeOut'
            });
            starGroup.add(star);
        }

        // Score info
        const infoBg = this.add.graphics();
        infoBg.fillStyle(0x1e293b, 0.9);
        infoBg.fillRoundedRect(-140, -25, 280, 50, 16);
        infoBg.lineStyle(2, 0x38bdf8, 1);
        infoBg.strokeRoundedRect(-140, -25, 280, 50, 16);

        const scoreText = this.add.text(0, 0, `👑 CROWD POWER: ${this.crowdCount * 100} PTS`, {
            fontSize: '15px',
            fontFamily: 'Arial Black',
            color: '#38bdf8'
        }).setOrigin(0.5);

        // Big CTA Button
        const ctaBtn = this.add.container(0, 95);
        const btnBg = this.add.graphics();
        btnBg.fillStyle(0x22c55e, 1);
        btnBg.fillRoundedRect(-135, -30, 270, 60, 30);
        btnBg.lineStyle(3, 0xffffff, 0.9);
        btnBg.strokeRoundedRect(-135, -30, 270, 60, 30);

        const btnText = this.add.text(0, -2, 'DOWNLOAD NOW', {
            fontSize: '22px',
            fontFamily: 'Arial Black',
            color: '#ffffff',
            stroke: '#15803d',
            strokeThickness: 4
        }).setOrigin(0.5);

        const subBtnText = this.add.text(0, 18, 'FREE ON GOOGLE PLAY', {
            fontSize: '10px',
            fontFamily: 'Arial Black',
            color: '#dcfce7'
        }).setOrigin(0.5);

        ctaBtn.add([btnBg, btnText, subBtnText]);

        // CTA Pulse animation
        this.tweens.add({
            targets: ctaBtn,
            scale: 1.08,
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        card.add([victoryText, subText, starGroup, infoBg, scoreText, ctaBtn]);
        card.setScale(0.7);
        card.alpha = 0;

        this.tweens.add({
            targets: card,
            scale: 1,
            alpha: 1,
            duration: 400,
            ease: 'Back.easeOut'
        });

        // Auto redirect after 20s if inactive
        this.time.delayedCall(20000, () => {
            if (!this.hasTriggeredStore) {
                this.ShowStore();
            }
        });
    }

    ShowStore() {
        if (this.hasTriggeredStore) return;
        this.hasTriggeredStore = true;

        const storeUrl = "https://play.google.com/store/apps/details?id=com.bf14.epic.run.survivor.game";
        console.log("Playturbo: ShowStore triggered (CTA Click)");

        // 1. Mintegral / Playturbo
        if (typeof window.install === 'function') {
            window.install();
            return;
        }

        // 2. Google Ads
        if (typeof ExitApi !== 'undefined' && typeof ExitApi.exit === 'function') {
            ExitApi.exit();
            return;
        }

        // 3. AppLovin (MRAID)
        if (typeof mraid !== 'undefined' && typeof mraid.open === 'function') {
            mraid.open(storeUrl);
            return;
        }

        // 4. TikTok Ads / Pangle
        if (typeof window.openAppStore === 'function') {
            window.openAppStore();
            return;
        }

        // Fallback for regular browser test
        window.open(storeUrl, '_blank');
    }
}