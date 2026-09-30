import Phaser from 'phaser';
import { Game3D } from './Game3D.js';

// Import sound assets for Vite bundling & single-file inlining
import sfxClick from './assets/Sound/click.mp3';
import sfxComplete from './assets/Sound/levelcomplete.mp3';
import sfxGameover from './assets/Sound/gameover.mp3';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        try {
            this.load.audio('sfx_click', sfxClick);
            this.load.audio('sfx_complete', sfxComplete);
            this.load.audio('sfx_gameover', sfxGameover);
        } catch (e) {
            console.warn('Audio preload fallback', e);
        }

        // Generate confetti particle texture
        const cGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        cGraphics.fillStyle(0xffffff, 1);
        cGraphics.fillRect(0, 0, 12, 7);
        cGraphics.generateTexture('confetti', 12, 7);

        // Generate coin icon texture
        const coinG = this.make.graphics({ x: 0, y: 0, add: false });
        coinG.fillStyle(0xffd700, 1);
        coinG.fillCircle(16, 16, 15);
        coinG.fillStyle(0xffa500, 1);
        coinG.fillCircle(16, 16, 12);
        coinG.lineStyle(2, 0xffffff, 0.9);
        coinG.strokeCircle(16, 16, 13);
        coinG.generateTexture('icon_coin', 32, 32);

        // Generate diamond icon texture
        const diaG = this.make.graphics({ x: 0, y: 0, add: false });
        diaG.fillStyle(0xa855f7, 1);
        diaG.beginPath();
        diaG.moveTo(16, 2);
        diaG.lineTo(30, 12);
        diaG.lineTo(16, 30);
        diaG.lineTo(2, 12);
        diaG.closePath();
        diaG.fillPath();
        diaG.lineStyle(2, 0xffffff, 0.8);
        diaG.strokePath();
        diaG.generateTexture('icon_diamond', 32, 32);

        // Generate tutorial finger texture
        const fingerG = this.make.graphics({ x: 0, y: 0, add: false });
        fingerG.fillStyle(0xffffff, 0.95);
        fingerG.fillRoundedRect(10, 4, 12, 32, 6);
        fingerG.fillCircle(16, 8, 6);
        fingerG.fillRoundedRect(4, 20, 24, 22, 8);
        fingerG.lineStyle(2, 0x333333, 0.8);
        fingerG.strokeRoundedRect(4, 20, 24, 22, 8);
        fingerG.generateTexture('icon_hand', 32, 46);
    }

    create() {
        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
        this.w = this.cameras.main.width;
        this.h = this.cameras.main.height;
        this.centerX = this.w / 2;
        this.centerY = this.h / 2;

        this.coins = 8800;
        this.diamonds = 400;
        this.squadCount = 1;
        this.gameStarted = false;
        this.isComplete = false;

        this.initWebAudioSynth();

        if (this.game && this.game.canvas) {
            this.game.canvas.style.position = 'absolute';
            this.game.canvas.style.top = '0';
            this.game.canvas.style.left = '0';
            this.game.canvas.style.zIndex = '10';
        }

        // Initialize 3D Engine with Model Skin_BF14.glb & Gate multipliers
        const container = document.getElementById('game-container');
        this.game3d = new Game3D(container, {
            onHit: (data) => this.handleHit(data),
            onProgress: (ratio) => this.updateProgressBar(ratio),
            onSquadCountChange: (count) => this.handleSquadCountChange(count),
            onCoinCollect: (data) => this.handleCoinCollect(data),
            onLevelComplete: () => this.handleVictory()
        });

        // Keep only tutorial drag hint during gameplay; keep UI win screen intact
        this.createTutorialHint();

        // Input listeners
        this.input.on('pointerdown', (pointer) => {
            if (!this.gameStarted) {
                this.startGame();
            }
            if (this.game3d) {
                this.game3d.isGameActive = true;
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (pointer.isDown && this.game3d) {
                this.game3d.isGameActive = true;
                const normX = (pointer.x - this.centerX) / (this.w * 0.45);
                this.game3d.targetPlayerX = Phaser.Math.Clamp(-1.2 - normX * 3.4, this.game3d.minPlayerX, this.game3d.maxPlayerX);
            }
        });
    }

    initWebAudioSynth() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        } catch (e) {
            console.warn('Web Audio synthesis not supported', e);
        }
    }

    playSynthSound(type) {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        if (type === 'chop') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(180 + Math.random() * 50, now);
            osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.09);
        } else if (type === 'coin') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(987.77, now);
            osc.frequency.setValueAtTime(1318.51, now + 0.06);

            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.23);
        } else if (type === 'gate') {
            [440, 554.37, 659.25, 880].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.05);

                gain.gain.setValueAtTime(0.2, now + i * 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.25);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.05);
                osc.stop(now + i * 0.05 + 0.26);
            });
        }
    }

    createTopHUD() {
        const topY = 48;

        // 1. Level 10 Badge (Top Left)
        const lvlContainer = this.add.container(65, topY);
        const lvlBg = this.add.graphics();
        lvlBg.fillStyle(0x000000, 0.35);
        lvlBg.fillRoundedRect(-48, -16, 96, 32, 16);
        lvlBg.lineStyle(2, 0xffffff, 0.3);
        lvlBg.strokeRoundedRect(-48, -16, 96, 32, 16);
        lvlContainer.add(lvlBg);

        const lvlText = this.add.text(0, 0, 'Level 10', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '17px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        lvlContainer.add(lvlText);

        // 2. Coin Badge (Top Right)
        const coinContainer = this.add.container(this.w - 65, topY - 14);
        const coinBg = this.add.graphics();
        coinBg.fillStyle(0xffffff, 0.9);
        coinBg.fillRoundedRect(-45, -13, 90, 26, 13);
        coinBg.lineStyle(2, 0x4a4a4a, 0.8);
        coinBg.strokeRoundedRect(-45, -13, 90, 26, 13);
        coinContainer.add(coinBg);

        const coinIcon = this.add.image(32, 0, 'icon_coin').setDisplaySize(24, 24);
        coinContainer.add(coinIcon);

        this.coinText = this.add.text(-10, 0, '8K8', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '15px',
            color: '#1e1e1e',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        coinContainer.add(this.coinText);

        // 3. Diamond Badge (Top Right, below coin)
        const diaContainer = this.add.container(this.w - 65, topY + 18);
        const diaBg = this.add.graphics();
        diaBg.fillStyle(0xffffff, 0.9);
        diaBg.fillRoundedRect(-45, -13, 90, 26, 13);
        diaBg.lineStyle(2, 0x4a4a4a, 0.8);
        diaBg.strokeRoundedRect(-45, -13, 90, 26, 13);
        diaContainer.add(diaBg);

        const diaIcon = this.add.image(32, 0, 'icon_diamond').setDisplaySize(22, 22);
        diaContainer.add(diaIcon);

        this.diaText = this.add.text(-10, 0, '400', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '15px',
            color: '#1e1e1e',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        diaContainer.add(this.diaText);
    }

    createSquadCounterBadge() {
        // Floating Squad Count indicator
        this.squadBadgeContainer = this.add.container(this.centerX, 110);

        const bg = this.add.graphics();
        bg.fillStyle(0x0284c7, 0.85);
        bg.fillRoundedRect(-50, -18, 100, 36, 18);
        bg.lineStyle(3, 0xffffff, 0.95);
        bg.strokeRoundedRect(-50, -18, 100, 36, 18);
        this.squadBadgeContainer.add(bg);

        this.squadBadgeText = this.add.text(0, 0, '👥 1', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '20px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.squadBadgeContainer.add(this.squadBadgeText);
    }

    createLeftProgressHUD() {
        const barX = 38;
        const barY = this.h * 0.42;
        const barW = 28;
        const barH = 260;

        this.progressContainer = this.add.container(barX, barY);

        // Background Track Capsule
        const bgG = this.add.graphics();
        bgG.fillStyle(0x1e293b, 0.7);
        bgG.fillRoundedRect(-barW / 2, -barH / 2, barW, barH, 14);
        bgG.lineStyle(3, 0xffffff, 0.9);
        bgG.strokeRoundedRect(-barW / 2, -barH / 2, barW, barH, 14);
        this.progressContainer.add(bgG);

        // Green Liquid Fill
        this.progressFill = this.add.graphics();
        this.progressContainer.add(this.progressFill);

        // Checkpoint 1 (Bottom)
        const cp1 = this.add.container(0, barH / 2 - 15);
        const c1Bg = this.add.graphics();
        c1Bg.fillStyle(0x38bdf8, 1);
        c1Bg.fillCircle(0, 0, 16);
        c1Bg.lineStyle(2, 0xffffff, 1);
        c1Bg.strokeCircle(0, 0, 16);
        const c1Text = this.add.text(12, 0, '1', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '18px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0, 0.5);
        cp1.add([c1Bg, c1Text]);
        this.progressContainer.add(cp1);

        // Checkpoint 2 (Middle)
        const cp2 = this.add.container(0, -barH * 0.1);
        const c2Bg = this.add.graphics();
        c2Bg.fillStyle(0x1d4ed8, 1);
        c2Bg.fillCircle(0, 0, 16);
        c2Bg.lineStyle(2, 0xffffff, 1);
        c2Bg.strokeCircle(0, 0, 16);
        const c2Text = this.add.text(12, 0, '2', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '18px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0, 0.5);
        cp2.add([c2Bg, c2Text]);
        this.progressContainer.add(cp2);

        // Crown at top
        const cpTop = this.add.container(0, -barH / 2 + 15);
        const topBg = this.add.graphics();
        topBg.fillStyle(0xf59e0b, 1);
        topBg.fillCircle(0, 0, 15);
        topBg.lineStyle(2, 0xffffff, 1);
        topBg.strokeCircle(0, 0, 15);
        const topIcon = this.add.text(0, 0, '👑', { fontSize: '15px' }).setOrigin(0.5);
        cpTop.add([topBg, topIcon]);
        this.progressContainer.add(cpTop);

        this.updateProgressBar(0.05);
    }

    updateProgressBar(ratio) {
        if (!this.progressFill) return;
        const barW = 24;
        const barH = 254;
        const fillH = Phaser.Math.Clamp(ratio * barH, 12, barH);

        this.progressFill.clear();
        this.progressFill.fillStyle(0x22c55e, 0.95);
        this.progressFill.fillRoundedRect(
            -barW / 2,
            barH / 2 - fillH,
            barW,
            fillH,
            12
        );
    }

    createBottomBanner() {
        const bannerContainer = this.add.container(this.centerX, this.h - 55);

        const bannerW = this.w * 0.92;
        const bannerH = 68;

        const bgG = this.add.graphics();
        // Shadow
        bgG.fillStyle(0x0284c7, 0.7);
        bgG.fillRoundedRect(-bannerW / 2 + 3, -bannerH / 2 + 6, bannerW, bannerH, 12);

        // Main Sky Blue Fill
        bgG.fillStyle(0x38bdf8, 1);
        bgG.fillRoundedRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 12);

        // White border
        bgG.lineStyle(4, 0xffffff, 1);
        bgG.strokeRoundedRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 12);
        bannerContainer.add(bgG);

        const bannerText = this.add.text(0, 0, 'COLLECT BOOSTS', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '30px',
            color: '#ffffff',
            stroke: '#0369a1',
            strokeThickness: 8,
            shadow: { offsetX: 2, offsetY: 3, color: '#0c4a6e', blur: 0, stroke: true, fill: true }
        }).setOrigin(0.5);
        bannerContainer.add(bannerText);

        this.tweens.add({
            targets: bannerContainer,
            scaleX: 1.04,
            scaleY: 1.04,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    createTutorialHint() {
        this.tutorialGroup = this.add.container(this.centerX, this.h * 0.76);

        const hand = this.add.image(0, 0, 'icon_hand').setScale(1.3);
        const text = this.add.text(0, 42, 'DRAG TO RUN & SMASH!', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '20px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(0.5);

        this.tutorialGroup.add([hand, text]);

        this.tweens.add({
            targets: hand,
            x: 50,
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    startGame() {
        this.gameStarted = true;
        if (this.tutorialGroup) {
            this.tweens.add({
                targets: this.tutorialGroup,
                alpha: 0,
                duration: 400,
                onComplete: () => this.tutorialGroup.destroy()
            });
        }

        if (typeof window.gameStart === 'function') {
            window.gameStart();
        }
    }

    handleHit(data) {
        this.playSynthSound('chop');
        this.cameras.main.shake(50, 0.003);
    }

    handleSquadCountChange(count) {
        this.squadCount = count;
        if (this.squadBadgeText) {
            this.squadBadgeText.setText(`👥 ${count}`);
        }

        if (this.squadBadgeContainer) {
            this.tweens.add({
                targets: this.squadBadgeContainer,
                scale: 1.3,
                duration: 160,
                yoyo: true,
                ease: 'Back.easeOut'
            });
        }

        this.playSynthSound('gate');
        this.showFloatPopup(`SQUAD ${count}!`, 0x38bdf8);
    }

    handleCoinCollect(data) {
        this.coins += data.amount || 250;
        if (this.coinText) {
            this.coinText.setText(`${(this.coins / 1000).toFixed(1)}K`);
        }
        this.playSynthSound('coin');
    }

    showFloatPopup(text, color = 0xffffff) {
        const popup = this.add.text(this.centerX, this.centerY - 90, text, {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '30px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 7
        }).setOrigin(0.5).setScale(0.5);

        this.tweens.add({
            targets: popup,
            scale: 1.25,
            y: this.centerY - 170,
            alpha: { start: 1, to: 0 },
            duration: 1100,
            ease: 'Back.easeOut',
            onComplete: () => popup.destroy()
        });
    }

    handleVictory() {
        if (this.isComplete) return;
        this.isComplete = true;

        try {
            this.sound.play('sfx_complete');
        } catch (e) {
            this.playSynthSound('gate');
        }

        this.createConfetti();
        this.time.delayedCall(800, () => {
            this.showVictoryEndCard();
        });
    }

    showVictoryEndCard() {
        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.65);
        overlay.fillRect(0, 0, this.w, this.h);
        overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.w, this.h), Phaser.Geom.Rectangle.Contains);
        overlay.on('pointerdown', () => this.ShowStore());

        const modal = this.add.container(this.centerX, this.centerY);

        const boxW = Math.min(380, this.w * 0.88);
        const boxH = 400;

        const boxBg = this.add.graphics();
        boxBg.fillStyle(0x1e293b, 0.95);
        boxBg.fillRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 20);
        boxBg.lineStyle(4, 0xfacc15, 1);
        boxBg.strokeRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 20);
        modal.add(boxBg);

        // Header
        const title = this.add.text(0, -boxH / 2 + 50, 'VICTORY!', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '38px',
            color: '#facc15',
            stroke: '#78350f',
            strokeThickness: 8
        }).setOrigin(0.5);
        modal.add(title);

        const subTitle = this.add.text(0, -boxH / 2 + 100, `SQUAD: ${this.squadCount} RUNNERS`, {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '18px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        modal.add(subTitle);

        // 3 Stars
        [-60, 0, 60].forEach((sx, i) => {
            const star = this.add.text(sx, -20, '⭐', { fontSize: '42px' }).setOrigin(0.5);
            star.setScale(0);
            this.tweens.add({
                targets: star,
                scale: 1,
                duration: 500,
                delay: 200 + i * 180,
                ease: 'Back.easeOut'
            });
            modal.add(star);
        });

        // Reward Pill
        const rewContainer = this.add.container(0, 55);
        const rewBg = this.add.graphics();
        rewBg.fillStyle(0x0f172a, 0.9);
        rewBg.fillRoundedRect(-110, -22, 220, 44, 22);
        rewBg.lineStyle(2, 0xffffff, 0.4);
        rewBg.strokeRoundedRect(-110, -22, 220, 44, 22);
        rewContainer.add(rewBg);

        const rewCoin = this.add.image(-70, 0, 'icon_coin').setDisplaySize(28, 28);
        const rewText = this.add.text(10, 0, '+8,800 COINS', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '18px',
            color: '#facc15',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        rewContainer.add([rewCoin, rewText]);
        modal.add(rewContainer);

        // CTA Button
        const ctaBtn = this.add.container(0, boxH / 2 - 60);
        const btnBg = this.add.graphics();
        btnBg.fillStyle(0x22c55e, 1);
        btnBg.fillRoundedRect(-120, -28, 240, 56, 28);
        btnBg.lineStyle(4, 0xffffff, 1);
        btnBg.strokeRoundedRect(-120, -28, 240, 56, 28);
        ctaBtn.add(btnBg);

        const btnText = this.add.text(0, 0, 'INSTALL NOW', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '24px',
            color: '#ffffff',
            stroke: '#15803d',
            strokeThickness: 6
        }).setOrigin(0.5);
        ctaBtn.add(btnText);
        modal.add(ctaBtn);

        this.tweens.add({
            targets: ctaBtn,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        modal.setScale(0);
        this.tweens.add({
            targets: modal,
            scale: 1,
            duration: 450,
            ease: 'Back.easeOut'
        });
    }

    update() {
        if (this.game3d) {
            this.game3d.update();
        }
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