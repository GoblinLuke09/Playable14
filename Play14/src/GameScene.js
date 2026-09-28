import Phaser from 'phaser';
import { generate3DRunnerFrames } from './assets/spritesheetGenerator.js';

// Import sound assets for Vite bundling & single-file inlining
import sfxClick from './assets/Sound/click.mp3';
import sfxComplete from './assets/Sound/levelcomplete.mp3';
import sfxGameover from './assets/Sound/gameover.mp3';

// Explicit Z-Index Depth Architecture
const DEPTH = {
    BACKGROUND: 10,
    ROAD: 20,
    ROAD_BORDER: 30,
    WORLD_BASE: 100, // World objects (gates, runners, enemies) get: WORLD_BASE + Math.floor(y * 10)
    PLAYER_BUBBLE: 6000,
    ENEMY_BUBBLE: 6100,
    POPUP_FX: 8000,
    HUD: 9000,
    ENDCARD: 10000
};

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Load audio assets directly using imported asset URLs
        try {
            this.load.audio('sfx_click', sfxClick);
            this.load.audio('sfx_complete', sfxComplete);
            this.load.audio('sfx_gameover', sfxGameover);
        } catch (e) {
            console.warn('Audio preload fallback', e);
        }

        // Confetti texture
        let cGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        cGraphics.fillStyle(0xffffff, 1);
        cGraphics.fillRect(0, 0, 10, 6);
        cGraphics.generateTexture('confetti', 10, 6);

    }

    create() {
        this.w = this.scale.width;
        this.h = this.scale.height;
        this.centerX = this.w / 2;

        // 3D Perspective Road Projection Coordinates
        this.horizonY = 85;
        this.bottomY = this.h + 20;
        this.roadTopWidth = 165;
        this.roadBottomWidth = Math.min(this.w * 0.98, 440);

        this.gameState = 'TUTORIAL'; // TUTORIAL, RUNNING, BATTLE, ENDCARD
        this.crowdCount = 1; // Starts with 1 single runner
        this.enemyArmyCount = 120; // Final enemy army count to beat
        this.playerLaneX = 0; // Normalized -1 to +1 relative to road center
        this.targetLaneX = 0;
        this.playerScreenY = this.h * 0.76;
        this.scrollSpeed = 120; // Relaxed walking speed in pixels per second
        this.distanceTravelled = 0;
        this.isInteracted = false;
        this.hasTriggeredStore = false;

        this.generateTextures();
        this.createStadiumBackground();
        this.createPerspectiveRoad();
        this.createTrackElements();
        this.createCrowd();
        this.createUI();
        this.setupInput();

        // Notify Playturbo / Networks
        if (typeof window.gameReady === 'function') {
            window.gameReady();
        }

        // Auto-pilot if no touch after 3s
        this.autoPilotTimer = this.time.delayedCall(3000, () => {
            if (!this.isInteracted && this.gameState === 'TUTORIAL') {
                this.startGame();
                this.tweens.add({
                    targets: this,
                    targetLaneX: 0.5,
                    duration: 1000,
                    ease: 'Power2'
                });
            }
        });
    }

    // Convert normalized Lane (-1 to 1 on PLAYABLE GREEN TURF ONLY) and Screen Y into Screen X
    getRoadPoint(lane, screenY) {
        const t = Phaser.Math.Clamp((screenY - this.horizonY) / (this.bottomY - this.horizonY), 0, 1);
        const roadW = Phaser.Math.Linear(this.roadTopWidth, this.roadBottomWidth, t);
        const scale = Phaser.Math.Linear(0.45, 1.0, t);

        const tartanFraction = 0.20; // Left 20% is decorative red tartan track, 80% is playable green turf

        const fullLeftX = this.centerX - roadW / 2;
        const fullRightX = this.centerX + roadW / 2;
        const dividerX = fullLeftX + roadW * tartanFraction;

        // Playable Green Turf Track (80% width)
        const turfLeftX = dividerX;
        const turfRightX = fullRightX;
        const turfWidth = turfRightX - turfLeftX;
        const turfCenterX = (turfLeftX + turfRightX) / 2;

        // Account for crowd horizontal spread radius so the entire mob stays strictly within the green turf
        const crowdRadius = Math.min(52, (Math.sqrt(this.crowdCount) * 7.5 + 10) * scale);
        const maxOffset = Math.max(10, (turfWidth / 2) - crowdRadius - 12);

        const screenX = turfCenterX + (lane * maxOffset);
        return { 
            x: screenX, 
            y: screenY, 
            scale: scale, 
            width: roadW, 
            turfWidth: turfWidth,
            turfCenterX: turfCenterX,
            turfLeftX: turfLeftX,
            turfRightX: turfRightX,
            maxOffset: maxOffset, 
            crowdRadius: crowdRadius 
        };
    }

    generateTextures() {
        // 1. Generate 3D Animated Runner Spritesheets (Blue and Red)
        this.blueAnimKey = generate3DRunnerFrames(this, 'blue');
        this.redAnimKey = generate3DRunnerFrames(this, 'red');

        // 2. Blue Speech Bubble
        if (!this.textures.exists('bubble_blue')) {
            const canvas = document.createElement('canvas');
            canvas.width = 110;
            canvas.height = 65;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0284c7';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(6, 6, 98, 42, 20) : ctx.fillRect(6, 6, 98, 42);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(46, 47);
            ctx.lineTo(55, 60);
            ctx.lineTo(64, 47);
            ctx.fillStyle = '#0284c7';
            ctx.fill();
            ctx.stroke();

            this.textures.addCanvas('bubble_blue', canvas);
        }

        // 3. Red Speech Bubble
        if (!this.textures.exists('bubble_red')) {
            const canvas = document.createElement('canvas');
            canvas.width = 110;
            canvas.height = 65;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#ef4444';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(6, 6, 98, 42, 20) : ctx.fillRect(6, 6, 98, 42);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(46, 47);
            ctx.lineTo(55, 60);
            ctx.lineTo(64, 47);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.stroke();

            this.textures.addCanvas('bubble_red', canvas);
        }
    }

    createStadiumBackground() {
        // Clean Warm Sandy Stadium Ground Environment matching reference image
        const bg = this.add.graphics().setDepth(DEPTH.BACKGROUND);
        bg.fillStyle(0xede4cd, 1);
        bg.fillRect(0, 0, this.w, this.h);

        // Soft sky atmosphere above the track horizon
        const sky = this.add.graphics().setDepth(DEPTH.BACKGROUND + 1);
        sky.fillGradientStyle(0xd4e7f8, 0xd4e7f8, 0xede4cd, 0xede4cd, 1, 1, 1, 1);
        sky.fillRect(0, 0, this.w, this.horizonY + 30);
    }

    createPerspectiveRoad() {
        this.roadGraphics = this.add.graphics().setDepth(DEPTH.ROAD);
        this.trackScrollProgress = 0;
        this.stripeCount = 10;
        this.fenceCount = 12;
    }

    draw3DPerspectiveRoad() {
        this.roadGraphics.clear();

        const tartanFraction = 0.20; // 20% left side is red athletic running track, 80% right side is green turf

        const topLeft = this.centerX - this.roadTopWidth / 2;
        const topRight = this.centerX + this.roadTopWidth / 2;
        const botLeft = this.centerX - this.roadBottomWidth / 2;
        const botRight = this.centerX + this.roadBottomWidth / 2;

        const topTartan = topLeft + this.roadTopWidth * tartanFraction;
        const botTartan = botLeft + this.roadBottomWidth * tartanFraction;

        // 1. Right Side Green Turf Alternating Horizontal Stripes
        const numStripes = this.stripeCount;
        for (let i = 0; i < numStripes * 2; i++) {
            const pStart = ((this.trackScrollProgress + i / numStripes) % 2) / 2;
            const pEnd = pStart + 1 / (numStripes * 2);

            if (pStart >= 1) continue;
            const clampedPStart = Math.max(0, pStart);
            const clampedPEnd = Math.min(1, pEnd);
            if (clampedPEnd <= clampedPStart) continue;

            const y0 = Phaser.Math.Linear(this.horizonY, this.bottomY, clampedPStart);
            const y1 = Phaser.Math.Linear(this.horizonY, this.bottomY, clampedPEnd);
            const w0 = Phaser.Math.Linear(this.roadTopWidth, this.roadBottomWidth, clampedPStart);
            const w1 = Phaser.Math.Linear(this.roadTopWidth, this.roadBottomWidth, clampedPEnd);

            const tx0 = this.centerX - w0 / 2 + w0 * tartanFraction;
            const rx0 = this.centerX + w0 / 2;
            const tx1 = this.centerX - w1 / 2 + w1 * tartanFraction;
            const rx1 = this.centerX + w1 / 2;

            const isDark = (i % 2 === 0);
            this.roadGraphics.fillStyle(isDark ? 0x5ea364 : 0xade6a2, 1);
            this.roadGraphics.beginPath();
            this.roadGraphics.moveTo(tx0, y0);
            this.roadGraphics.lineTo(rx0, y0);
            this.roadGraphics.lineTo(rx1, y1);
            this.roadGraphics.lineTo(tx1, y1);
            this.roadGraphics.closePath();
            this.roadGraphics.fill();
        }

        // 2. Left Side Red Tartan Athletic Running Track
        this.roadGraphics.fillStyle(0xd9534f, 1);
        this.roadGraphics.beginPath();
        this.roadGraphics.moveTo(topLeft, this.horizonY);
        this.roadGraphics.lineTo(topTartan, this.horizonY);
        this.roadGraphics.lineTo(botTartan, this.bottomY);
        this.roadGraphics.lineTo(botLeft, this.bottomY);
        this.roadGraphics.closePath();
        this.roadGraphics.fill();

        // 2 Thin White Lane Lines inside the Red Tartan Track
        this.roadGraphics.lineStyle(2, 0xffffff, 0.95);
        const topLane1 = topLeft + this.roadTopWidth * tartanFraction * 0.33;
        const botLane1 = botLeft + this.roadBottomWidth * tartanFraction * 0.33;
        const topLane2 = topLeft + this.roadTopWidth * tartanFraction * 0.66;
        const botLane2 = botLeft + this.roadBottomWidth * tartanFraction * 0.66;
        this.roadGraphics.lineBetween(topLane1, this.horizonY, botLane1, this.bottomY);
        this.roadGraphics.lineBetween(topLane2, this.horizonY, botLane2, this.bottomY);

        // 3. Right Outer Dark Green Border Strip
        const topCurb = topRight - 8;
        const botCurb = botRight - 16;
        this.roadGraphics.fillStyle(0x356d39, 1);
        this.roadGraphics.beginPath();
        this.roadGraphics.moveTo(topCurb, this.horizonY);
        this.roadGraphics.lineTo(topRight, this.horizonY);
        this.roadGraphics.lineTo(botRight, this.bottomY);
        this.roadGraphics.lineTo(botCurb, this.bottomY);
        this.roadGraphics.closePath();
        this.roadGraphics.fill();

        // 4. White Perspective Divider Lines
        this.roadGraphics.lineStyle(3, 0xffffff, 1);
        this.roadGraphics.lineBetween(topLeft, this.horizonY, botLeft, this.bottomY); // Left boundary
        this.roadGraphics.lineBetween(topTartan, this.horizonY, botTartan, this.bottomY); // Track divider
        this.roadGraphics.lineBetween(topRight, this.horizonY, botRight, this.bottomY); // Right boundary

        // 5. Perspective Stadium Fence Posts & Rails along borders
        const numPosts = this.fenceCount;
        for (let j = 0; j <= numPosts; j++) {
            const p = ((this.trackScrollProgress * 0.5 + j / numPosts) % 1);
            const y = Phaser.Math.Linear(this.horizonY, this.bottomY, p);
            const w = Phaser.Math.Linear(this.roadTopWidth, this.roadBottomWidth, p);
            const postH = Phaser.Math.Linear(12, 34, p);

            const lx = this.centerX - w / 2;
            const mx = lx + w * tartanFraction;
            const rx = this.centerX + w / 2;

            // White Posts
            this.roadGraphics.lineStyle(Phaser.Math.Linear(1.5, 3.5, p), 0xffffff, 0.95);
            this.roadGraphics.lineBetween(lx - 2, y, lx - 2, y - postH);
            this.roadGraphics.lineBetween(mx, y, mx, y - postH * 0.85);
            this.roadGraphics.lineBetween(rx + 2, y, rx + 2, y - postH);

            // Ball tops
            this.roadGraphics.fillStyle(0xffffff, 1);
            const ballR = Phaser.Math.Linear(2, 4.5, p);
            this.roadGraphics.fillCircle(lx - 2, y - postH, ballR);
            this.roadGraphics.fillCircle(mx, y - postH * 0.85, ballR * 0.8);
            this.roadGraphics.fillCircle(rx + 2, y - postH, ballR);
        }
    }

    createTrackElements() {
        // 4 Gate Sets spaced across extended track length
        this.gates = [
            {
                distance: 480,
                passed: false,
                left: { type: '+', val: 10, label: '+10', color: 0x0284c7 },
                right: { type: '+', val: 25, label: '+25', color: 0x10b981 },
                container: this.add.container(0, 0)
            },
            {
                distance: 1040,
                passed: false,
                left: { type: 'x', val: 2, label: 'x2', color: 0xf59e0b },
                right: { type: '+', val: 15, label: '+15', color: 0x0284c7 },
                container: this.add.container(0, 0)
            },
            {
                distance: 1600,
                passed: false,
                left: { type: '+', val: 40, label: '+40', color: 0x0284c7 },
                right: { type: 'x', val: 3, label: 'x3', color: 0x10b981 },
                container: this.add.container(0, 0)
            },
            {
                distance: 2160,
                passed: false,
                left: { type: 'x', val: 2, label: 'x2', color: 0x0284c7 },
                right: { type: 'x', val: 4, label: 'x4', color: 0xf59e0b },
                container: this.add.container(0, 0)
            }
        ];

        this.gates.forEach(g => {
            this.buildGate3D(g);
            g.container.setVisible(false);
        });

        // ==========================================
        // FINISH DESTINATION: RED MOB ARMY BATTLE
        // ==========================================
        this.finishDistance = 2680;

        // Red Army Mob waiting at the finish line
        this.enemyArmyContainer = this.add.container(this.centerX, -200);
        this.enemyArmyContainer.setVisible(false);

        this.enemyBubble = this.add.container(0, -60);
        const redBubbleBg = this.add.sprite(0, 0, 'bubble_red').setScale(0.95);
        this.enemyBubbleText = this.add.text(0, -6, `${this.enemyArmyCount}`, {
            fontSize: '24px',
            fontFamily: 'Arial Black',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.enemyBubble.add([redBubbleBg, this.enemyBubbleText]);
        this.enemyBubble.setDepth(DEPTH.ENEMY_BUBBLE);

        this.enemySoldiers = [];
        for (let i = 0; i < 35; i++) {
            const r = this.add.sprite(0, 0, 'red_run_0').setScale(0.85);
            r.play('red_runner_run');
            r.anims.setProgress(Math.random());

            const col = (i % 7) - 3;
            const row = Math.floor(i / 7);
            r.gridX = col * 17;
            r.gridY = row * 15;
            r.x = r.gridX;
            r.y = r.gridY;
            r.setDepth(row * 2);
            this.enemySoldiers.push(r);
            this.enemyArmyContainer.add(r);
        }
        this.enemyArmyContainer.add(this.enemyBubble);
    }

    buildGate3D(gate) {
        const bg = this.add.graphics();
        gate.graphics = bg;

        const leftPost = this.add.rectangle(-80, 0, 10, 48, 0xbae6fd).setStrokeStyle(2, 0xffffff);
        const midPost = this.add.rectangle(0, 0, 10, 48, 0xbae6fd).setStrokeStyle(2, 0xffffff);
        const rightPost = this.add.rectangle(80, 0, 10, 48, 0xbae6fd).setStrokeStyle(2, 0xffffff);

        const leftText = this.add.text(-40, 0, gate.left.label, {
            fontSize: '32px',
            fontFamily: 'Arial Black, Impact',
            color: '#ffffff',
            stroke: '#0284c7',
            strokeThickness: 5
        }).setOrigin(0.5);

        const rightText = this.add.text(40, 0, gate.right.label, {
            fontSize: '32px',
            fontFamily: 'Arial Black, Impact',
            color: '#ffffff',
            stroke: '#0284c7',
            strokeThickness: 5
        }).setOrigin(0.5);

        gate.leftPost = leftPost;
        gate.midPost = midPost;
        gate.rightPost = rightPost;
        gate.leftText = leftText;
        gate.rightText = rightText;

        gate.container.add([bg, leftPost, midPost, rightPost, leftText, rightText]);
    }

    updateGate3D(gate, screenY) {
        const t = Phaser.Math.Clamp((screenY - this.horizonY) / (this.bottomY - this.horizonY), 0, 1);
        const roadW = Phaser.Math.Linear(this.roadTopWidth, this.roadBottomWidth, t);
        const scale = Phaser.Math.Linear(0.45, 1.0, t);

        const tartanFraction = 0.20;
        const fullLeftX = this.centerX - roadW / 2;
        const dividerX = fullLeftX + roadW * tartanFraction;
        const fullRightX = this.centerX + roadW / 2;
        const turfWidth = fullRightX - dividerX;
        const turfCenterX = (dividerX + fullRightX) / 2;

        const alpha = Phaser.Math.Clamp((screenY - this.horizonY) / 60, 0, 1);
        gate.container.setAlpha(alpha);

        gate.container.x = turfCenterX;
        gate.container.y = screenY;
        gate.container.setScale(scale);
        gate.container.setDepth(DEPTH.WORLD_BASE + Math.floor(screenY * 10));

        const halfW = turfWidth / 2 / scale;
        gate.leftPost.x = -halfW;
        gate.rightPost.x = halfW;
        gate.midPost.x = 0;

        gate.leftText.x = -halfW * 0.5;
        gate.rightText.x = halfW * 0.5;

        gate.graphics.clear();
        gate.graphics.fillStyle(gate.left.color, 0.45);
        gate.graphics.fillRect(-halfW, -24, halfW, 48);
        gate.graphics.lineStyle(3, 0xffffff, 0.95);
        gate.graphics.strokeRect(-halfW, -24, halfW, 48);

        gate.graphics.fillStyle(gate.right.color, 0.45);
        gate.graphics.fillRect(0, -24, halfW, 48);
        gate.graphics.strokeRect(0, -24, halfW, 48);
    }

    createCrowd() {
        this.runners = [];
        this.updateCrowdVisuals();

        this.playerBubble = this.add.container(this.centerX, this.playerScreenY - 60);
        const bubbleBg = this.add.sprite(0, 0, 'bubble_blue').setScale(0.85);
        this.bubbleCountText = this.add.text(0, -6, `${this.crowdCount}`, {
            fontSize: '22px',
            fontFamily: 'Arial Black',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.playerBubble.add([bubbleBg, this.bubbleCountText]);
        this.playerBubble.setDepth(DEPTH.PLAYER_BUBBLE);
    }

    updateCrowdVisuals() {
        const targetVisible = Math.min(this.crowdCount, 45);

        while (this.runners.length < targetVisible) {
            const r = this.add.sprite(this.centerX, this.playerScreenY, 'blue_run_0');
            r.setScale(0.95);
            r.play('blue_runner_run');
            r.anims.setProgress(Math.random());
            r.setDepth(DEPTH.WORLD_BASE + Math.floor(this.playerScreenY * 10));
            this.runners.push(r);
        }

        while (this.runners.length > targetVisible) {
            const r = this.runners.pop();
            r.destroy();
        }

        for (let i = 0; i < this.runners.length; i++) {
            const r = this.runners[i];
            if (i === 0) {
                r.offsetX = 0;
                r.offsetY = 0;
            } else {
                const radius = Math.sqrt(i) * 11;
                const angle = i * 2.39996;
                r.offsetX = Math.cos(angle) * radius * 1.35;
                r.offsetY = Math.sin(angle) * radius * 0.75;
            }
        }
    }

    createUI() {
        this.dragPrompt = this.add.text(this.centerX + 35, this.playerScreenY - 110, 'SWIPE TO MULTIPLY SQUAD!', {
            fontSize: '15px',
            fontFamily: 'Arial Black',
            color: '#ffffff',
            stroke: '#0284c7',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(DEPTH.HUD);

        this.tweens.add({
            targets: this.dragPrompt,
            scale: 1.1,
            duration: 600,
            yoyo: true,
            repeat: -1
        });
    }

    setupInput() {
        this.input.on('pointerdown', (p) => this.handlePointer(p));
        this.input.on('pointermove', (p) => {
            if (p.isDown) this.handlePointer(p);
        });
    }

    handlePointer(p) {
        if (this.gameState === 'ENDCARD') {
            this.ShowStore();
            return;
        }

        if (!this.isInteracted) {
            this.startGame();
        }

        const playerCenterPt = this.getRoadPoint(0, this.playerScreenY);
        const halfTurfW = (playerCenterPt.turfWidth / 2) - 16;
        this.targetLaneX = Phaser.Math.Clamp((p.x - playerCenterPt.turfCenterX) / halfTurfW, -1, 1);
    }

    startGame() {
        this.isInteracted = true;
        this.gameState = 'RUNNING';

        if (typeof window.gameStart === 'function') {
            window.gameStart();
        }

        this.tweens.add({
            targets: this.dragPrompt,
            alpha: 0,
            duration: 300,
            onComplete: () => this.dragPrompt.setVisible(false)
        });

        this.playSfx('sfx_click');
    }

    playSfx(key) {
        try {
            if (this.sound && this.sound.play) {
                this.sound.play(key, { volume: 0.6 });
            }
        } catch (e) { }
    }

    update(time, delta) {
        const dt = delta / 1000;

        // 1. Scroll 3D Perspective Athletic Track Stripes & Fences
        const scrollDelta = this.gameState === 'RUNNING' ? 0.35 : 0.08;
        this.trackScrollProgress += scrollDelta * dt;
        if (this.trackScrollProgress > 1) this.trackScrollProgress -= 1;
        this.draw3DPerspectiveRoad();

        // 2. Smooth Player Movement
        this.playerLaneX = Phaser.Math.Linear(this.playerLaneX, this.targetLaneX, 0.2);
        const playerPt = this.getRoadPoint(this.playerLaneX, this.playerScreenY);

        // Update Crowd Visual Positions & Strict Clamping within green turf borders
        const turfLeftEdge = playerPt.turfLeftX + 14;
        const turfRightEdge = playerPt.turfRightX - 14;

        for (let i = 0; i < this.runners.length; i++) {
            const r = this.runners[i];
            const desiredX = playerPt.x + r.offsetX * playerPt.scale;
            r.x = Phaser.Math.Clamp(desiredX, turfLeftEdge, turfRightEdge);
            r.y = playerPt.y + r.offsetY * playerPt.scale;
            r.setScale(0.95 * playerPt.scale);
            r.setDepth(DEPTH.WORLD_BASE + Math.floor(r.y * 10));
        }

        this.playerBubble.x = Phaser.Math.Clamp(playerPt.x, turfLeftEdge + 18, turfRightEdge - 18);
        this.playerBubble.y = playerPt.y - 65 * playerPt.scale;
        this.playerBubble.setScale(playerPt.scale);
        this.playerBubble.setDepth(DEPTH.PLAYER_BUBBLE);

        // 3. Track Progression during RUNNING state
        if (this.gameState === 'RUNNING') {
            this.distanceTravelled += this.scrollSpeed * dt;

            // Update All 4 Gates
            this.gates.forEach(gate => {
                const gateScreenY = this.playerScreenY - (gate.distance - this.distanceTravelled);
                if (gateScreenY >= this.horizonY && gateScreenY <= this.bottomY + 80) {
                    gate.container.setVisible(true);
                    this.updateGate3D(gate, gateScreenY);

                    if (!gate.passed && gateScreenY >= this.playerScreenY - 20) {
                        gate.passed = true;
                        const chosenSide = this.playerLaneX < 0 ? gate.left : gate.right;
                        this.applyGateEffect(chosenSide, gateScreenY);
                    }
                } else {
                    gate.container.setVisible(false);
                }
            });

            // Enemy Army emerges at the finish distance
            const finishDistFromPlayer = this.finishDistance - this.distanceTravelled;
            const enemyScreenY = this.playerScreenY - finishDistFromPlayer;

            if (enemyScreenY >= this.horizonY) {
                const enemyPt = this.getRoadPoint(0, enemyScreenY);
                const alpha = Phaser.Math.Clamp((enemyScreenY - this.horizonY) / 30, 0, 1);
                this.enemyArmyContainer.setVisible(true);
                this.enemyArmyContainer.setAlpha(alpha);
                this.enemyArmyContainer.x = enemyPt.x;
                this.enemyArmyContainer.y = enemyPt.y;
                this.enemyArmyContainer.setScale(enemyPt.scale);
                this.enemyArmyContainer.setDepth(DEPTH.WORLD_BASE + Math.floor(enemyScreenY * 10));

                if (enemyScreenY >= this.playerScreenY - 30) {
                    this.startFinalBattle();
                }
            } else {
                this.enemyArmyContainer.setVisible(false);
            }
        }
    }

    applyGateEffect(side, gateY) {
        this.playSfx('sfx_click');
        this.cameras.main.shake(140, 0.012);

        const prev = this.crowdCount;
        let delta = 0;

        if (side.type === '+') {
            delta = side.val;
            this.crowdCount += delta;
        } else if (side.type === 'x') {
            delta = this.crowdCount * (side.val - 1);
            this.crowdCount = this.crowdCount * side.val;
        }

        this.bubbleCountText.setText(`${this.crowdCount}`);
        this.tweens.add({
            targets: this.playerBubble,
            scale: 1.35,
            duration: 120,
            yoyo: true
        });

        this.updateCrowdVisuals();

        const playerPt = this.getRoadPoint(this.playerLaneX, this.playerScreenY);
        const deltaLabel = `+${delta}`;
        const popupText = this.add.text(playerPt.x, this.playerScreenY - 95, deltaLabel, {
            fontSize: '44px',
            fontFamily: 'Arial Black',
            color: '#22c55e',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(DEPTH.POPUP_FX);

        const subPopup = this.add.text(playerPt.x, this.playerScreenY - 60, `TOTAL: ${this.crowdCount}`, {
            fontSize: '18px',
            fontFamily: 'Arial Black',
            color: '#38bdf8',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(DEPTH.POPUP_FX);

        this.tweens.add({
            targets: [popupText, subPopup],
            y: '-=80',
            alpha: 0,
            scale: 1.3,
            duration: 900,
            ease: 'Power2',
            onComplete: () => {
                popupText.destroy();
                subPopup.destroy();
            }
        });

        this.spawnSplash(playerPt.x, this.playerScreenY - 40, 0x22c55e, 25);
        this.spawnSplash(playerPt.x, this.playerScreenY - 20, 0x38bdf8, 20);
    }

    spawnSplash(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const p = this.add.circle(x, y, Phaser.Math.Between(3, 7), color);
            const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const spd = Phaser.Math.FloatBetween(60, 240);
            p.setDepth(DEPTH.POPUP_FX);

            this.tweens.add({
                targets: p,
                x: x + Math.cos(a) * spd,
                y: y + Math.sin(a) * spd,
                alpha: 0,
                scale: 0.1,
                duration: 500,
                onComplete: () => p.destroy()
            });
        }
    }

    startFinalBattle() {
        if (this.gameState === 'BATTLE' || this.gameState === 'ENDCARD') return;
        this.gameState = 'BATTLE';

        const playerPt = this.getRoadPoint(0, this.playerScreenY);

        this.battleTimer = this.time.addEvent({
            delay: 60,
            repeat: -1,
            callback: () => {
                const tickDamage = Math.max(3, Math.floor(Math.max(this.crowdCount, this.enemyArmyCount) / 15));
                this.crowdCount = Math.max(0, this.crowdCount - tickDamage);
                this.enemyArmyCount = Math.max(0, this.enemyArmyCount - tickDamage);

                this.bubbleCountText.setText(`${this.crowdCount}`);
                this.enemyBubbleText.setText(`${this.enemyArmyCount}`);

                this.cameras.main.shake(60, 0.008);
                this.spawnSplash(playerPt.x, this.playerScreenY - 40, 0xef4444, 4);
                this.spawnSplash(playerPt.x, this.playerScreenY - 20, 0x0284c7, 4);
                this.playSfx('sfx_click');

                if (this.crowdCount <= 0 || this.enemyArmyCount <= 0) {
                    this.battleTimer.remove();

                    if (this.crowdCount > 0 && this.enemyArmyCount <= 0) {
                        this.finishBattle(true);
                    } else {
                        this.finishBattle(false);
                    }
                }
            }
        });
    }

    finishBattle(isVictory) {
        if (this.gameState === 'ENDCARD') return;
        this.gameState = 'ENDCARD';

        if (isVictory) {
            this.playSfx('sfx_complete');
            this.spawnSplash(this.centerX, this.playerScreenY - 40, 0xfacc15, 50);
            this.cameras.main.shake(300, 0.02);

            if (this.castleBanner) {
                this.castleBanner.setText('👑 CASTLE CONQUERED! 👑');
                this.castleBanner.setColor('#22c55e');
            }

            this.tweens.add({
                targets: this.enemyArmyContainer,
                scale: 0.1,
                alpha: 0,
                duration: 400,
                onComplete: () => this.enemyArmyContainer.setVisible(false)
            });
        } else {
            this.playSfx('sfx_gameover');
            this.cameras.main.shake(300, 0.02);
        }

        this.time.delayedCall(600, () => {
            this.showEndCard(isVictory);
            this.createConfetti();
        });
    }

    showEndCard(isVictory) {
        const overlay = this.add.rectangle(this.centerX, this.h / 2, this.w, this.h, 0x000000, 0)
            .setInteractive()
            .setDepth(DEPTH.ENDCARD);

        this.tweens.add({
            targets: overlay,
            fillAlpha: 0.85,
            duration: 500
        });

        overlay.on('pointerdown', () => this.ShowStore());

        const card = this.add.container(this.centerX, this.h / 2).setDepth(DEPTH.ENDCARD + 1);

        const title = this.add.text(0, -160, isVictory ? '🏆 CASTLE CONQUERED! 🏆' : '💀 DEFEAT! 💀', {
            fontSize: '32px',
            fontFamily: 'Arial Black',
            color: isVictory ? '#facc15' : '#ef4444',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        const subText = this.add.text(0, -110, isVictory ? `SURVIVORS: ${this.crowdCount}` : 'YOU NEED MORE SOLDIERS!', {
            fontSize: '18px',
            fontFamily: 'Arial Black',
            color: '#ffffff'
        }).setOrigin(0.5);

        const ctaBtn = this.add.container(0, 80);
        const btnBg = this.add.graphics();
        btnBg.fillStyle(isVictory ? 0x22c55e : 0x3b82f6, 1);
        btnBg.fillRoundedRect(-140, -32, 280, 64, 32);
        btnBg.lineStyle(3, 0xffffff, 1);
        btnBg.strokeRoundedRect(-140, -32, 280, 64, 32);

        const btnText = this.add.text(0, -4, isVictory ? 'DOWNLOAD NOW' : 'TRY AGAIN', {
            fontSize: '22px',
            fontFamily: 'Arial Black',
            color: '#ffffff',
            stroke: isVictory ? '#15803d' : '#1d4ed8',
            strokeThickness: 4
        }).setOrigin(0.5);

        const subBtnText = this.add.text(0, 18, 'FREE TO PLAY', {
            fontSize: '11px',
            fontFamily: 'Arial Black',
            color: '#dcfce7'
        }).setOrigin(0.5);

        ctaBtn.add([btnBg, btnText, subBtnText]);

        this.tweens.add({
            targets: ctaBtn,
            scale: 1.08,
            duration: 650,
            yoyo: true,
            repeat: -1
        });

        card.add([title, subText, ctaBtn]);
        card.setScale(0.7);
        card.alpha = 0;

        this.tweens.add({
            targets: card,
            scale: 1,
            alpha: 1,
            duration: 400,
            ease: 'Back.easeOut'
        });

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

        if (typeof window.install === 'function') {
            window.install();
            return;
        }
        if (typeof ExitApi !== 'undefined' && typeof ExitApi.exit === 'function') {
            ExitApi.exit();
            return;
        }
        if (typeof mraid !== 'undefined' && typeof mraid.open === 'function') {
            mraid.open(storeUrl);
            return;
        }
        if (typeof window.openAppStore === 'function') {
            window.openAppStore();
            return;
        }
        window.open(storeUrl, '_blank');
    }

    createConfetti() {
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff8800, 0xfacc15];

        // 1. Pháo nổ tung 360 độ ngay chính giữa màn hình (Center Fireworks Burst)
        const centerBurst = this.add.particles(this.centerX, this.h * 0.38, 'confetti', {
            speed: { min: 120, max: 420 },
            angle: { min: 0, max: 360 },
            gravityY: 280,
            lifespan: 3800,
            scale: { start: 1.6, end: 0.4 },
            rotate: { min: 0, max: 720 },
            tint: colors,
            quantity: 70
        });

        // 2. Pháo bên trái bắn chéo rót vào tâm giữa màn hình
        const leftCannon = this.add.particles(20, this.h * 0.8, 'confetti', {
            speed: { min: 380, max: 680 },
            angle: { min: -65, max: -38 },
            gravityY: 380,
            lifespan: 4000,
            scale: { start: 1.4, end: 0.4 },
            rotate: { min: 0, max: 720 },
            tint: colors,
            quantity: 45
        });

        // 3. Pháo bên phải bắn chéo rót vào tâm giữa màn hình
        const rightCannon = this.add.particles(this.w - 20, this.h * 0.8, 'confetti', {
            speed: { min: 380, max: 680 },
            angle: { min: -142, max: -115 },
            gravityY: 380,
            lifespan: 4000,
            scale: { start: 1.4, end: 0.4 },
            rotate: { min: 0, max: 720 },
            tint: colors,
            quantity: 45
        });

        centerBurst.setDepth(50000);
        leftCannon.setDepth(50000);
        rightCannon.setDepth(50000);

        centerBurst.explode();
        leftCannon.explode();
        rightCannon.explode();

        this.time.delayedCall(5000, () => {
            centerBurst.destroy();
            leftCannon.destroy();
            rightCannon.destroy();
        });
    }

}