import Phaser from 'phaser';
import { generate3DRunnerFrames, generateProjectileTexture } from './assets/spritesheetGenerator.js';

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
    ROAD_ENEMY_BUBBLE: 5500,
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
        this.enemyArmyCount = 55; // Balanced final enemy army count
        this.playerLaneX = 0; // Normalized -1 to +1 relative to road center
        this.targetLaneX = 0;
        this.playerScreenY = this.h * 0.76;
        this.scrollSpeed = 120; // Relaxed walking speed in pixels per second
        this.distanceTravelled = 0;
        this.isInteracted = false;
        this.hasTriggeredStore = false;

        // Projectiles & Shooting
        this.projectiles = [];
        this.shootTimer = 0;

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

        const tartanFraction = 0.22; // Left 22% is decorative red tartan track, 78% is playable green turf

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

        // 2. Generate Spiked Club Projectile Texture
        this.projectileKey = generateProjectileTexture(this);

        // 2. Blue Speech Bubble (3D Volumetric Glossy Badge)
        if (!this.textures.exists('bubble_blue')) {
            const canvas = document.createElement('canvas');
            canvas.width = 116;
            canvas.height = 70;
            const ctx = canvas.getContext('2d');

            // Drop shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(8, 8, 100, 44, 22) : ctx.fillRect(8, 8, 100, 44);
            ctx.fill();

            // 3D Spherical/Cylindrical Body Gradient
            const bgGrad = ctx.createLinearGradient(0, 4, 0, 48);
            bgGrad.addColorStop(0, '#38bdf8');
            bgGrad.addColorStop(0.3, '#0284c7');
            bgGrad.addColorStop(0.85, '#0369a1');
            bgGrad.addColorStop(1, '#075985');

            ctx.fillStyle = bgGrad;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(6, 4, 100, 44, 22) : ctx.fillRect(6, 4, 100, 44);
            ctx.fill();
            ctx.stroke();

            // Glossy Glass Highlight Arc
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.beginPath();
            ctx.ellipse(56, 14, 38, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            // Tail with 3D shading
            ctx.beginPath();
            ctx.moveTo(48, 47);
            ctx.lineTo(56, 62);
            ctx.lineTo(64, 47);
            ctx.fillStyle = '#0369a1';
            ctx.fill();
            ctx.stroke();

            this.textures.addCanvas('bubble_blue', canvas);
        }

        // 3. Red Speech Bubble (3D Volumetric Glossy Badge)
        if (!this.textures.exists('bubble_red')) {
            const canvas = document.createElement('canvas');
            canvas.width = 116;
            canvas.height = 70;
            const ctx = canvas.getContext('2d');

            // Drop shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(8, 8, 100, 44, 22) : ctx.fillRect(8, 8, 100, 44);
            ctx.fill();

            // 3D Body Gradient
            const bgGrad = ctx.createLinearGradient(0, 4, 0, 48);
            bgGrad.addColorStop(0, '#f87171');
            bgGrad.addColorStop(0.3, '#ef4444');
            bgGrad.addColorStop(0.85, '#dc2626');
            bgGrad.addColorStop(1, '#991b1b');

            ctx.fillStyle = bgGrad;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(6, 4, 100, 44, 22) : ctx.fillRect(6, 4, 100, 44);
            ctx.fill();
            ctx.stroke();

            // Glossy Glass Highlight Arc
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.beginPath();
            ctx.ellipse(56, 14, 38, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            // Tail
            ctx.beginPath();
            ctx.moveTo(48, 47);
            ctx.lineTo(56, 62);
            ctx.lineTo(64, 47);
            ctx.fillStyle = '#dc2626';
            ctx.fill();
            ctx.stroke();

            this.textures.addCanvas('bubble_red', canvas);
        }
    }

    createStadiumBackground() {
        // Clean Warm Sandy Stadium Ground Environment matching reference image
        const bg = this.add.graphics().setDepth(DEPTH.BACKGROUND);
        bg.fillStyle(0xded7cb, 1);
        bg.fillRect(0, 0, this.w, this.h);

        // Soft warm atmospheric horizon
        const sky = this.add.graphics().setDepth(DEPTH.BACKGROUND + 1);
        sky.fillGradientStyle(0xeee9e0, 0xeee9e0, 0xded7cb, 0xded7cb, 1, 1, 1, 1);
        sky.fillRect(0, 0, this.w, this.horizonY + 30);
    }

    createPerspectiveRoad() {
        this.roadGraphics = this.add.graphics().setDepth(DEPTH.ROAD);
        this.trackScrollProgress = 0;
        this.stripeCount = 8;
        this.fenceCount = 10;
    }

    draw3DPerspectiveRoad() {
        this.roadGraphics.clear();

        const tartanFraction = 0.22; // 22% left side is red athletic running track, 78% right side is green grass turf

        const topLeft = this.centerX - this.roadTopWidth / 2;
        const topRight = this.centerX + this.roadTopWidth / 2;
        const botLeft = this.centerX - this.roadBottomWidth / 2;
        const botRight = this.centerX + this.roadBottomWidth / 2;

        const topTartan = topLeft + this.roadTopWidth * tartanFraction;
        const botTartan = botLeft + this.roadBottomWidth * tartanFraction;

        // 0. Soft Ambient Occlusion Under Track Borders (3D Ground Contact)
        this.roadGraphics.fillStyle(0x000000, 0.10);
        this.roadGraphics.beginPath();
        this.roadGraphics.moveTo(topLeft - 10, this.horizonY);
        this.roadGraphics.lineTo(topRight + 10, this.horizonY);
        this.roadGraphics.lineTo(botRight + 20, this.bottomY);
        this.roadGraphics.lineTo(botLeft - 20, this.bottomY);
        this.roadGraphics.closePath();
        this.roadGraphics.fill();

        // 1. Right Side Green Turf Alternating Horizontal Stripes (Exact colors from reference)
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
            // Light grass: #9edb96, Dark grass: #5ca358
            this.roadGraphics.fillStyle(isDark ? 0x5ca358 : 0x9edb96, 1);
            this.roadGraphics.beginPath();
            this.roadGraphics.moveTo(tx0, y0);
            this.roadGraphics.lineTo(rx0, y0);
            this.roadGraphics.lineTo(rx1, y1);
            this.roadGraphics.lineTo(tx1, y1);
            this.roadGraphics.closePath();
            this.roadGraphics.fill();
        }

        // 2. Left Side Red Tartan Athletic Running Track (#d96556)
        this.roadGraphics.fillStyle(0xd96556, 1);
        this.roadGraphics.beginPath();
        this.roadGraphics.moveTo(topLeft, this.horizonY);
        this.roadGraphics.lineTo(topTartan, this.horizonY);
        this.roadGraphics.lineTo(botTartan, this.bottomY);
        this.roadGraphics.lineTo(botLeft, this.bottomY);
        this.roadGraphics.closePath();
        this.roadGraphics.fill();

        // 2 Thin White Lane Lines inside Red Running Track
        this.roadGraphics.lineStyle(1.8, 0xffffff, 0.95);
        const topLane1 = topLeft + this.roadTopWidth * tartanFraction * 0.33;
        const botLane1 = botLeft + this.roadBottomWidth * tartanFraction * 0.33;
        const topLane2 = topLeft + this.roadTopWidth * tartanFraction * 0.66;
        const botLane2 = botLeft + this.roadBottomWidth * tartanFraction * 0.66;
        this.roadGraphics.lineBetween(topLane1, this.horizonY, botLane1, this.bottomY);
        this.roadGraphics.lineBetween(topLane2, this.horizonY, botLane2, this.bottomY);

        // 3. Crisp White Perspective Border & Divider Lines
        this.roadGraphics.lineStyle(3.0, 0xffffff, 1);
        this.roadGraphics.lineBetween(topLeft, this.horizonY, botLeft, this.bottomY);     // Left outer curb
        this.roadGraphics.lineBetween(topTartan, this.horizonY, botTartan, this.bottomY); // Center divider
        this.roadGraphics.lineBetween(topRight, this.horizonY, botRight, this.bottomY);   // Right outer curb

        // 4. Continuous Perspective White Top & Mid Rails along outer boundaries
        this.roadGraphics.lineStyle(2.2, 0xffffff, 0.95);
        // Left Rails
        this.roadGraphics.lineBetween(topLeft - 3, this.horizonY - 10, botLeft - 3, this.bottomY - 32);
        this.roadGraphics.lineBetween(topLeft - 3, this.horizonY - 5, botLeft - 3, this.bottomY - 16);
        // Middle Divider Rails
        this.roadGraphics.lineStyle(1.6, 0xffffff, 0.85);
        this.roadGraphics.lineBetween(topTartan, this.horizonY - 8, botTartan, this.bottomY - 26);
        // Right Rails
        this.roadGraphics.lineStyle(2.2, 0xffffff, 0.95);
        this.roadGraphics.lineBetween(topRight + 3, this.horizonY - 10, botRight + 3, this.bottomY - 32);
        this.roadGraphics.lineBetween(topRight + 3, this.horizonY - 5, botRight + 3, this.bottomY - 16);

        // 5. 3D White Hurdle / Fence Posts with perspective scaling
        const numPosts = this.fenceCount;
        for (let j = 0; j <= numPosts; j++) {
            const p = ((this.trackScrollProgress * 0.5 + j / numPosts) % 1);
            const y = Phaser.Math.Linear(this.horizonY, this.bottomY, p);
            const w = Phaser.Math.Linear(this.roadTopWidth, this.roadBottomWidth, p);
            const postH = Phaser.Math.Linear(12, 34, p);

            const lx = this.centerX - w / 2;
            const mx = lx + w * tartanFraction;
            const rx = this.centerX + w / 2;

            // Soft Ground Drop Shadow under post bases
            this.roadGraphics.fillStyle(0x000000, 0.20);
            this.roadGraphics.fillEllipse(lx - 3, y + 2, Phaser.Math.Linear(3, 7, p), Phaser.Math.Linear(1.5, 3, p));
            this.roadGraphics.fillEllipse(rx + 3, y + 2, Phaser.Math.Linear(3, 7, p), Phaser.Math.Linear(1.5, 3, p));

            // White Vertical Posts
            const postW = Phaser.Math.Linear(2, 4, p);
            this.roadGraphics.lineStyle(postW, 0xffffff, 1);
            this.roadGraphics.lineBetween(lx - 3, y, lx - 3, y - postH);
            this.roadGraphics.lineBetween(rx + 3, y, rx + 3, y - postH);

            // Middle Divider Posts
            this.roadGraphics.lineStyle(postW * 0.8, 0xffffff, 0.9);
            this.roadGraphics.lineBetween(mx, y, mx, y - postH * 0.8);

            // Post Caps (clean rounded white balls / caps)
            this.roadGraphics.fillStyle(0xffffff, 1);
            const capR = Phaser.Math.Linear(2.0, 4.5, p);
            this.roadGraphics.fillCircle(lx - 3, y - postH, capR);
            this.roadGraphics.fillCircle(rx + 3, y - postH, capR);
            this.roadGraphics.fillCircle(mx, y - postH * 0.8, capR * 0.8);
        }
    }

    createTrackElements() {
        this.finalGatePassed = false;

        // Gates spaced across extended track length
        this.gates = [
            {
                distance: 280,
                passed: false,
                side: 'right', // Gate 1: Positive (+8) on right
                effect: { type: '+', val: 8, label: '+8', color: 0x10b981 },
                container: this.add.container(0, 0)
            },
            {
                distance: 900,
                passed: false,
                side: 'left', // Gate 2: Multiplier (x2) on left
                effect: { type: 'x', val: 2, label: 'x2', color: 0x0284c7 },
                container: this.add.container(0, 0)
            },
            {
                distance: 1520,
                passed: false,
                side: 'right', // Gate 3: Danger trap gate (÷2) on right (dodge left)
                effect: { type: '÷', val: 2, label: '÷2', color: 0xef4444 },
                container: this.add.container(0, 0)
            },
            {
                distance: 2060,
                passed: false,
                side: 'left', // Gate 4: Positive (+10) on left
                effect: { type: '+', val: 10, label: '+10', color: 0x10b981 },
                container: this.add.container(0, 0)
            },
            {
                distance: 2280,
                passed: false,
                side: 'left', // Gate 5: Danger trap gate (-8) on left (dodge right)
                effect: { type: '-', val: 8, label: '-8', color: 0xef4444 },
                container: this.add.container(0, 0)
            },
            {
                distance: 2680,
                passed: false,
                isFinalGate: true,
                side: 'right', // Gate 6: FINAL GATE (x2) on right
                effect: { type: 'x', val: 2, label: 'x2', color: 0x0284c7 },
                container: this.add.container(0, 0)
            }
        ];

        this.gates.forEach(g => {
            this.buildGate3D(g);
            g.container.setVisible(false);
        });

        // ==========================================
        // ROAD ENEMIES STANDING ALONG THE TRACK
        // ==========================================
        this.roadEnemies = [
            // Wave 1: After Gate 1 (distance 580) - 2 enemies side-by-side (matching reference)
            { id: 1, distance: 580, lane: -0.42, maxHp: 8, hp: 8, alive: true },
            { id: 2, distance: 580, lane: 0.42, maxHp: 8, hp: 8, alive: true },

            // Wave 2: After Gate 2 (distance 1220) - 2 enemies
            { id: 3, distance: 1220, lane: -0.38, maxHp: 14, hp: 14, alive: true },
            { id: 4, distance: 1220, lane: 0.38, maxHp: 14, hp: 14, alive: true },

            // Wave 3: After Gate 3 (distance 1780) - 3 enemies
            { id: 5, distance: 1780, lane: -0.52, maxHp: 20, hp: 20, alive: true },
            { id: 6, distance: 1780, lane: 0.0, maxHp: 20, hp: 20, alive: true },
            { id: 7, distance: 1780, lane: 0.52, maxHp: 20, hp: 20, alive: true },

            // Wave 4: After Gate 5 (distance 2480) - 3 enemies
            { id: 8, distance: 2480, lane: -0.45, maxHp: 25, hp: 25, alive: true },
            { id: 9, distance: 2480, lane: 0.0, maxHp: 25, hp: 25, alive: true },
            { id: 10, distance: 2480, lane: 0.45, maxHp: 25, hp: 25, alive: true }
        ];

        this.roadEnemies.forEach(e => {
            this.buildRoadEnemy(e);
        });

        // ==========================================
        this.finalGatePassed = false;
        this.finalEnemyDistance = null;

        // Red Army Mob waiting at the finish line (spawns at horizon after final gate)
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

    buildRoadEnemy(enemy) {
        const container = this.add.container(0, 0);

        // Ground shadow for road enemy
        const shadow = this.add.ellipse(0, 36, 30, 9, 0x000000, 0.25);

        // Animated Red Runner sprite with baseball bat
        const sprite = this.add.sprite(0, 0, 'red_run_0').setScale(0.95);
        sprite.play('red_runner_run');
        sprite.anims.setProgress(Math.random());

        // HP Badge floating above head
        const hpContainer = this.add.container(0, -48);
        const badgeBg = this.add.graphics();
        badgeBg.fillStyle(0xef4444, 0.95);
        badgeBg.fillRoundedRect(-18, -11, 36, 22, 11);
        badgeBg.lineStyle(2, 0xffffff, 1);
        badgeBg.strokeRoundedRect(-18, -11, 36, 22, 11);

        const hpText = this.add.text(0, 0, `${enemy.hp}`, {
            fontSize: '13px',
            fontFamily: 'Arial Black',
            color: '#ffffff'
        }).setOrigin(0.5);

        hpContainer.add([badgeBg, hpText]);

        container.add([shadow, sprite, hpContainer]);
        container.setVisible(false);

        enemy.container = container;
        enemy.sprite = sprite;
        enemy.hpContainer = hpContainer;
        enemy.hpText = hpText;
    }

    buildGate3D(gate) {
        const bg = this.add.graphics();
        gate.graphics = bg;

        // 3D Metallic Posts
        const post1 = this.add.container(0, 0);
        const post2 = this.add.container(0, 0);

        const text = this.add.text(0, -2, gate.effect.label, {
            fontSize: '34px',
            fontFamily: 'Arial Black, Impact',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(0.5);

        gate.post1 = post1;
        gate.post2 = post2;
        gate.text = text;

        gate.container.add([bg, post1, post2, text]);
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
        const isLeft = gate.side === 'left';

        const xStart = isLeft ? -halfW : 0;
        const xEnd = isLeft ? 0 : halfW;
        const xMid = (xStart + xEnd) / 2;

        gate.post1.x = xStart;
        gate.post2.x = xEnd;
        gate.text.x = xMid;

        gate.graphics.clear();

        // 1. Soft Ground Glow under Gate
        gate.graphics.fillStyle(gate.effect.color, 0.28);
        gate.graphics.fillEllipse(xMid, 26, halfW * 0.9, 14);

        // 2. Translucent 3D Holographic Glass Field
        gate.graphics.fillStyle(gate.effect.color, 0.55);
        gate.graphics.fillRect(xStart, -28, halfW, 54);

        // 3D Glass Highlight Sheen Arc
        gate.graphics.fillStyle(0xffffff, 0.25);
        gate.graphics.fillRect(xStart + 3, -26, halfW - 6, 12);

        // Neon Glow Outer Frame
        gate.graphics.lineStyle(3.5, 0xffffff, 0.98);
        gate.graphics.strokeRect(xStart, -28, halfW, 54);

        // 3. 3D Cylindrical Vertical Posts
        [xStart, xEnd].forEach(px => {
            // Post core
            gate.graphics.fillStyle(0x0f172a, 0.9);
            gate.graphics.fillRect(px - 5, -34, 10, 66);

            // Light side
            gate.graphics.fillStyle(0xffffff, 0.9);
            gate.graphics.fillRect(px - 4, -34, 4, 66);

            // Glowing Energy Cap on top of pillar
            gate.graphics.fillStyle(gate.effect.color, 1);
            gate.graphics.fillCircle(px, -36, 6);
            gate.graphics.fillStyle(0xffffff, 1);
            gate.graphics.fillCircle(px, -36, 3);
        });

        // 4. Top 3D Arch Beam Connecting Pillars
        gate.graphics.fillStyle(0x1e293b, 0.95);
        gate.graphics.fillRect(xStart - 4, -32, halfW + 8, 8);
        gate.graphics.fillStyle(0xffffff, 0.7);
        gate.graphics.fillRect(xStart - 4, -32, halfW + 8, 2.5);
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
    }

    playSfx(key) {
        try {
            if (this.sound && this.sound.play) {
                this.sound.play(key, { volume: 0.6 });
            }
        } catch (e) { }
    }

    fireProjectiles() {
        if (this.gameState !== 'RUNNING') return;

        // Scale number of projectiles with squad count
        let numProjectiles = 1;
        if (this.crowdCount >= 40) numProjectiles = 6;
        else if (this.crowdCount >= 20) numProjectiles = 4;
        else if (this.crowdCount >= 8) numProjectiles = 3;
        else if (this.crowdCount >= 2) numProjectiles = 2;

        const runnerCount = Math.max(1, this.runners.length);

        for (let i = 0; i < numProjectiles; i++) {
            const runner = this.runners[i % runnerCount] || { offsetX: 0, offsetY: 0 };
            // Compute the exact fixed lane of the specific runner firing this bullet
            const runnerLane = this.playerLaneX + (runner.offsetX / 80);

            const projSprite = this.add.sprite(0, 0, 'spike_projectile').setOrigin(0.5, 0.5);
            const proj = {
                sprite: projSprite,
                distance: this.distanceTravelled + 25 + i * 6,
                lane: runnerLane, // Straight fixed trajectory along this runner's lane
                speed: 700,
                spinSpeed: Phaser.Math.Between(360, 720),
                dead: false
            };
            this.projectiles.push(proj);
        }
    }

    hitRoadEnemy(enemy, hitX, hitY) {
        if (!enemy.alive) return;
        enemy.hp--;
        enemy.hpText.setText(`${Math.max(0, enemy.hp)}`);

        // Flash tint & scale punch
        enemy.sprite.setTint(0xffffff);
        this.time.delayedCall(50, () => {
            if (enemy.sprite && enemy.sprite.active) enemy.sprite.clearTint();
        });

        this.tweens.add({
            targets: enemy.hpContainer,
            scale: 1.25,
            duration: 60,
            yoyo: true
        });

        // Small cyan and red impact sparks
        this.spawnSplash(hitX, hitY, 0x06b6d4, 3);
        this.spawnSplash(hitX, hitY, 0xef4444, 3);

        if (enemy.hp <= 0) {
            enemy.alive = false;
            // Camera shake & early SFX removed
            this.spawnSplash(hitX, hitY, 0xef4444, 25);
            this.spawnSplash(hitX, hitY, 0xfacc15, 15);

            // Floating defeat popup
            const koText = this.add.text(hitX, hitY - 35, '💥 K.O!', {
                fontSize: '22px',
                fontFamily: 'Arial Black',
                color: '#facc15',
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(0.5).setDepth(DEPTH.POPUP_FX);

            this.tweens.add({
                targets: koText,
                y: '-=60',
                alpha: 0,
                scale: 1.2,
                duration: 700,
                ease: 'Power2',
                onComplete: () => koText.destroy()
            });

            // Reward bonus soldiers
            this.crowdCount += 2;
            this.bubbleCountText.setText(`${this.crowdCount}`);
            this.updateCrowdVisuals();

            // Defeat animation
            this.tweens.add({
                targets: enemy.container,
                scale: 0.1,
                alpha: 0,
                duration: 250,
                onComplete: () => {
                    enemy.container.setVisible(false);
                }
            });
        }
    }

    hitFinishArmy(hitX, hitY) {
        if (this.enemyArmyCount <= 0) return;
        this.enemyArmyCount = Math.max(0, this.enemyArmyCount - 1);
        this.enemyBubbleText.setText(`${this.enemyArmyCount}`);
        this.spawnSplash(hitX, hitY, 0xef4444, 4);

        // Visually remove enemy soldiers as count drops
        const targetSoldiers = Math.min(this.enemySoldiers.length, Math.ceil(this.enemyArmyCount * 35 / 55));
        while (this.enemySoldiers.length > targetSoldiers && this.enemySoldiers.length > 0) {
            const s = this.enemySoldiers.pop();
            if (s && s.active) {
                this.spawnSplash(hitX, hitY, 0xef4444, 3);
                s.destroy();
            }
        }

        if (this.enemyArmyCount <= 0) {
            this.enemyArmyContainer.setVisible(false);
            this.spawnSplash(hitX, hitY, 0xfacc15, 30);
            this.finishBattle(true);
        }
    }

    update(time, delta) {
        const dt = delta / 1000;

        // 1. Scroll 3D Perspective Athletic Track Stripes & Fences
        const scrollDelta = this.gameState === 'RUNNING' ? 0.35 : 0.08;
        this.trackScrollProgress += scrollDelta * dt;
        if (this.trackScrollProgress > 1) this.trackScrollProgress -= 1;
        this.draw3DPerspectiveRoad();

        // 2. Smooth Player Movement with 3D Banking Roll Physics
        const prevLaneX = this.playerLaneX;
        this.playerLaneX = Phaser.Math.Linear(this.playerLaneX, this.targetLaneX, 0.2);
        const laneVelocity = (this.playerLaneX - prevLaneX) / Math.max(0.001, dt);
        const bankAngle = Phaser.Math.Clamp(laneVelocity * 4.2, -14, 14);
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
            r.setAngle(bankAngle * (0.85 + (i % 3) * 0.1));
            r.setDepth(DEPTH.WORLD_BASE + Math.floor(r.y * 10));
        }

        this.playerBubble.x = Phaser.Math.Clamp(playerPt.x, turfLeftEdge + 18, turfRightEdge - 18);
        this.playerBubble.y = playerPt.y - 65 * playerPt.scale;
        this.playerBubble.setScale(playerPt.scale);
        this.playerBubble.setAngle(bankAngle * 0.4);
        this.playerBubble.setDepth(DEPTH.PLAYER_BUBBLE);

        // 3. Track Progression during RUNNING state
        if (this.gameState === 'RUNNING') {
            this.distanceTravelled += this.scrollSpeed * dt;

            // Check if final gate (distance 2680) has been passed
            if (this.distanceTravelled >= 2680) {
                this.finalGatePassed = true;
            }

            // Continuous auto-shooting during run
            this.shootTimer += dt;
            const shootInterval = 0.14;
            if (this.shootTimer >= shootInterval) {
                this.shootTimer = 0;
                this.fireProjectiles();
            }

            // Update Active Projectiles (Maintain exact fixed lane trajectory)
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles[i];
                p.distance += p.speed * dt;

                const projDistFromPlayer = p.distance - this.distanceTravelled;
                const projScreenY = this.playerScreenY - projDistFromPlayer;

                if (p.dead || projScreenY < this.horizonY - 10 || projDistFromPlayer > 1100) {
                    p.sprite.destroy();
                    this.projectiles.splice(i, 1);
                    continue;
                }

                const pt = this.getRoadPoint(p.lane, projScreenY);
                p.sprite.x = pt.x;
                p.sprite.y = pt.y;
                p.sprite.setScale(pt.scale * 0.9);
                p.sprite.angle += p.spinSpeed * dt;
                p.sprite.setDepth(DEPTH.WORLD_BASE + Math.floor(pt.y * 10) + 2);

                // Collision with Road Enemies
                for (const enemy of this.roadEnemies) {
                    if (!enemy.alive) continue;
                    const distDiff = Math.abs(p.distance - enemy.distance);
                    const laneDiff = Math.abs(p.lane - enemy.lane);

                    if (distDiff < 32 && laneDiff < 0.24) {
                        p.dead = true;
                        this.hitRoadEnemy(enemy, pt.x, pt.y);
                        break;
                    }
                }

                // Collision with Final Finish Army (after final gate)
                if (!p.dead && this.finalGatePassed && this.enemyArmyCount > 0 && this.finalEnemyDistance !== null) {
                    if (Math.abs(p.distance - this.finalEnemyDistance) < 45) {
                        p.dead = true;
                        this.hitFinishArmy(pt.x, pt.y);
                    }
                }
            }

            // Update Road Enemies (Appear naturally along the track after their respective gates)
            this.roadEnemies.forEach(enemy => {
                if (!enemy.alive) return;
                const enemyDistFromPlayer = enemy.distance - this.distanceTravelled;
                const enemyScreenY = this.playerScreenY - enemyDistFromPlayer;

                if (enemyScreenY >= this.horizonY - 10 && enemyScreenY <= this.bottomY + 60) {
                    const enemyPt = this.getRoadPoint(enemy.lane, enemyScreenY);
                    const alpha = Phaser.Math.Clamp((enemyScreenY - this.horizonY) / 30, 0, 1);
                    enemy.container.setVisible(true);
                    enemy.container.setAlpha(alpha);
                    enemy.container.x = enemyPt.x;
                    enemy.container.y = enemyPt.y;
                    enemy.container.setScale(enemyPt.scale);
                    enemy.container.setDepth(DEPTH.WORLD_BASE + Math.floor(enemyScreenY * 10));

                    // Collision check with player crowd
                    if (enemyScreenY >= this.playerScreenY - 15) {
                        const laneDiff = Math.abs(this.playerLaneX - enemy.lane);
                        const isHit = laneDiff < 0.45 || enemyScreenY >= this.playerScreenY + 20;

                        if (isHit) {
                            enemy.alive = false;
                            const dmg = enemy.hp; // Deduct exact remaining enemy HP
                            this.crowdCount = Math.max(0, this.crowdCount - dmg);
                            this.bubbleCountText.setText(`${this.crowdCount}`);
                            this.updateCrowdVisuals();

                            // Red damage popup
                            const dmgPopup = this.add.text(enemyPt.x, enemyPt.y - 30, `-${dmg}`, {
                                fontSize: '32px',
                                fontFamily: 'Arial Black',
                                color: '#ef4444',
                                stroke: '#ffffff',
                                strokeThickness: 5
                            }).setOrigin(0.5).setDepth(DEPTH.POPUP_FX);

                            this.tweens.add({
                                targets: dmgPopup,
                                y: '-=50',
                                alpha: 0,
                                duration: 600,
                                onComplete: () => dmgPopup.destroy()
                            });

                            this.spawnSplash(enemyPt.x, enemyPt.y, 0xef4444, 25);
                            enemy.container.setVisible(false);

                            if (this.crowdCount <= 0) {
                                this.finishBattle(false);
                            }
                        } else if (enemyScreenY > this.playerScreenY + 60) {
                            // Safely passed behind player
                            enemy.alive = false;
                            enemy.container.setVisible(false);
                        }
                    }
                } else {
                    enemy.container.setVisible(false);
                }
            });

            // Update All Gates (Single-sided for player choice)
            this.gates.forEach(gate => {
                const gateScreenY = this.playerScreenY - (gate.distance - this.distanceTravelled);
                if (gateScreenY >= this.horizonY && gateScreenY <= this.bottomY + 80) {
                    gate.container.setVisible(true);
                    this.updateGate3D(gate, gateScreenY);

                    if (!gate.passed && gateScreenY >= this.playerScreenY - 20) {
                        gate.passed = true;
                        if (gate.isFinalGate) {
                            this.finalGatePassed = true;
                        }
                        const inLeftZone = this.playerLaneX <= 0.15;
                        const inRightZone = this.playerLaneX >= -0.15;
                        const hitGate = (gate.side === 'left' && inLeftZone) || (gate.side === 'right' && inRightZone);

                        if (hitGate) {
                            this.applyGateEffect(gate.effect, gateScreenY);
                        }
                    }
                } else {
                    gate.container.setVisible(false);
                }
            });

            // Final Enemy Army emerges from horizon (end of road) ONLY after passing final gate
            if (this.finalGatePassed && this.enemyArmyCount > 0 && this.gameState !== 'ENDCARD') {
                if (this.finalEnemyDistance === null) {
                    // Spawn precisely at the horizon line (end of the road)
                    this.finalEnemyDistance = this.distanceTravelled + (this.playerScreenY - this.horizonY);
                }

                const enemyDistFromPlayer = this.finalEnemyDistance - this.distanceTravelled;
                const enemyScreenY = this.playerScreenY - enemyDistFromPlayer;

                if (enemyScreenY >= this.horizonY - 5) {
                    const enemyPt = this.getRoadPoint(0, enemyScreenY);
                    const alpha = Phaser.Math.Clamp((enemyScreenY - this.horizonY) / 25, 0, 1);
                    this.enemyArmyContainer.setVisible(true);
                    this.enemyArmyContainer.setAlpha(alpha);
                    this.enemyArmyContainer.x = enemyPt.x;
                    this.enemyArmyContainer.y = enemyPt.y;
                    this.enemyArmyContainer.setScale(enemyPt.scale);
                    this.enemyArmyContainer.setDepth(DEPTH.WORLD_BASE + Math.floor(enemyScreenY * 10));

                    // When enemy army meets player crowd -> start final battle
                    if (enemyScreenY >= this.playerScreenY - 25) {
                        this.startFinalBattle();
                    }
                } else {
                    this.enemyArmyContainer.setVisible(false);
                }
            } else {
                this.enemyArmyContainer.setVisible(false);
            }
        }
    }

    applyGateEffect(side, gateY) {
        let delta = 0;

        if (side.type === '+') {
            delta = side.val;
            this.crowdCount += delta;
        } else if (side.type === 'x') {
            delta = this.crowdCount * (side.val - 1);
            this.crowdCount = this.crowdCount * side.val;
        } else if (side.type === '-') {
            const actualLoss = Math.min(this.crowdCount - 1, side.val);
            delta = -actualLoss;
            this.crowdCount = Math.max(1, this.crowdCount - side.val);
        } else if (side.type === '÷' || side.type === '/') {
            const targetCount = Math.max(1, Math.floor(this.crowdCount / side.val));
            delta = targetCount - this.crowdCount;
            this.crowdCount = targetCount;
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
        const isPositive = delta >= 0;
        const deltaLabel = isPositive ? `+${delta}` : `${delta}`;
        const popupColor = isPositive ? '#22c55e' : '#ef4444';

        const popupText = this.add.text(playerPt.x, this.playerScreenY - 95, deltaLabel, {
            fontSize: '44px',
            fontFamily: 'Arial Black',
            color: popupColor,
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(DEPTH.POPUP_FX);

        const subPopup = this.add.text(playerPt.x, this.playerScreenY - 60, `TOTAL: ${this.crowdCount}`, {
            fontSize: '18px',
            fontFamily: 'Arial Black',
            color: isPositive ? '#38bdf8' : '#f87171',
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

        if (isPositive) {
            this.spawnSplash(playerPt.x, this.playerScreenY - 40, 0x22c55e, 25);
            this.spawnSplash(playerPt.x, this.playerScreenY - 20, 0x38bdf8, 20);
        } else {
            this.spawnSplash(playerPt.x, this.playerScreenY - 40, 0xef4444, 25);
        }
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

                this.spawnSplash(playerPt.x, this.playerScreenY - 40, 0xef4444, 4);
                this.spawnSplash(playerPt.x, this.playerScreenY - 20, 0x0284c7, 4);

                // Visually pop soldiers as count goes down
                const targetSoldiers = Math.min(this.enemySoldiers.length, Math.ceil(this.enemyArmyCount * 35 / 55));
                while (this.enemySoldiers.length > targetSoldiers && this.enemySoldiers.length > 0) {
                    const s = this.enemySoldiers.pop();
                    if (s && s.active) s.destroy();
                }

                if (this.crowdCount <= 0 || this.enemyArmyCount <= 0) {
                    this.battleTimer.remove();
                    this.enemyArmyContainer.setVisible(false);

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