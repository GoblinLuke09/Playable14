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
        this.w = this.cameras.main.width;
        this.h = this.cameras.main.height;
        this.centerX = this.w / 2;
        this.centerY = this.h / 2;

        this.coins = 8800;
        this.diamonds = 400;
        this.squadCount = 0;
        this.gameStarted = false;
        this.isComplete = false;

        this.initWebAudioSynth();

        // Ensure Three.js canvas is at zIndex 1 and Phaser canvas is at zIndex 10
        if (this.game.canvas) {
            this.game.canvas.style.position = 'absolute';
            this.game.canvas.style.top = '0';
            this.game.canvas.style.left = '0';
            this.game.canvas.style.zIndex = '10';
            this.game.canvas.style.pointerEvents = 'auto';
        }

        // Initialize 3D Engine with Model Skin_BF14.glb & Gate multipliers
        const container = document.getElementById('game-container');
        this.game3d = new Game3D(container, {
            onHit: (data) => this.handleHit(data),
            onProgress: (ratio) => this.updateProgressBar(ratio),
            onSquadCountChange: (count) => this.handleSquadCountChange(count),
            onCoinCollect: (data) => this.handleCoinCollect(data),
            onTierUpgrade: (tier) => this.handleTierUpgrade(tier),
            onLevelTransition: (lv) => this.handleLevelTransition(lv),
            onLevelStart: (lv) => this.handleLevelStart(lv),
            onLevelComplete: () => this.handleVictory(),
            onGameOver: () => this.handleDefeat()
        });

        // Create only Tutorial Drag Hint on initial screen
        this.createTutorialHint();

        // Input listener
        this.input.on('pointerdown', () => {
            if (!this.gameStarted) {
                this.startGame();

            if (typeof window.gameReady === 'function') {
                        window.gameReady();
                    }

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

        if (type === 'pop') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(320 + Math.random() * 80, now);
            osc.frequency.exponentialRampToValueAtTime(120, now + 0.05);

            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.06);
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
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.04);

                gain.gain.setValueAtTime(0.18, now + i * 0.04);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.04 + 0.2);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.04);
                osc.stop(now + i * 0.04 + 0.21);
            });
        }
    }

    createTopHUD() {
        const topY = 48;

        // 1. Level 10 Badge (Top Left)
        const lvlContainer = this.add.container(65, topY);
        const lvlBg = this.add.graphics();
        lvlBg.fillStyle(0x000000, 0.45);
        lvlBg.fillRoundedRect(-48, -16, 96, 32, 16);
        lvlBg.lineStyle(2, 0xffffff, 0.4);
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
        coinBg.fillStyle(0xffffff, 0.95);
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
        diaBg.fillStyle(0xffffff, 0.95);
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
        // Floating Active Troops counter indicator
        this.squadBadgeContainer = this.add.container(this.centerX, 110);

        const bg = this.add.graphics();
        bg.fillStyle(0x0284c7, 0.9);
        bg.fillRoundedRect(-60, -18, 120, 36, 18);
        bg.lineStyle(3, 0xffffff, 0.95);
        bg.strokeRoundedRect(-60, -18, 120, 36, 18);
        this.squadBadgeContainer.add(bg);

        this.squadBadgeText = this.add.text(0, 0, '👥 MOBS: 0', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '18px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.squadBadgeContainer.add(this.squadBadgeText);
    }

    createTutorialHint() {
        this.tutorialGroup = this.add.container(this.centerX, this.h * 0.76);

        const hand = this.add.image(0, 0, 'icon_hand').setScale(1.4);
        const text = this.add.text(0, 48, 'DRAG CANNON TO SHOOT!', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '20px',
            color: '#ffffff',
            stroke: '#0284c7',
            strokeThickness: 6
        }).setOrigin(0.5);

        this.tutorialGroup.add([hand, text]);

        this.tweens.add({
            targets: hand,
            x: 60,
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
        this.playSynthSound('pop');
    }

    handleSquadCountChange(count) {
        this.squadCount = count;
        if (this.squadBadgeText) {
            this.squadBadgeText.setText(`👥 MOBS: ${count}`);
        }
    }

    handleCoinCollect(data) {
        this.coins += data.amount || 250;
        if (this.coinText) {
            this.coinText.setText(`${(this.coins / 1000).toFixed(1)}K`);
        }
        this.playSynthSound('coin');
    }

    handleTierUpgrade(tier) {
        if (tier <= 0) return;
        this.playSynthSound('gate');

        const tierNames = [
            'STARTER CANNON',
            '🔥 DUAL CANNON! (+1 MOB)',
            '⚡ TRIPLE CANNON! (+1 MOB)',
            '🚀 SUPER JET! (+1 MOB)'
        ];
        const title = tierNames[tier] || `TIER ${tier} UPGRADE!`;

        const banner = this.add.container(this.centerX, this.h * 0.28);
        banner.setDepth(200);

        const bg = this.add.graphics();
        bg.fillStyle(0x0f172a, 0.92);
        bg.fillRoundedRect(-160, -24, 320, 48, 24);
        bg.lineStyle(3, 0xfacc15, 1);
        bg.strokeRoundedRect(-160, -24, 320, 48, 24);
        banner.add(bg);

        const text = this.add.text(0, 0, title, {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '18px',
            color: '#facc15',
            stroke: '#78350f',
            strokeThickness: 4
        }).setOrigin(0.5);
        banner.add(text);

        banner.setScale(0.3);
        banner.setAlpha(0);

        this.tweens.add({
            targets: banner,
            scaleX: 1.05,
            scaleY: 1.05,
            alpha: 1,
            duration: 250,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: banner,
                    y: this.h * 0.22,
                    alpha: 0,
                    scaleX: 0.9,
                    scaleY: 0.9,
                    duration: 500,
                    delay: 900,
                    ease: 'Power2',
                    onComplete: () => banner.destroy()
                });
            }
        });
    }

    handleLevelTransition(lv) {
        try {
            this.sound.play('sfx_complete');
        } catch (e) {
            this.playSynthSound('gate');
        }

        this.createConfetti();

        const banner = this.add.container(this.centerX, this.centerY - 40);
        banner.setDepth(300);

        const bg = this.add.graphics();
        bg.fillStyle(0x0f172a, 0.95);
        bg.fillRoundedRect(-175, -45, 350, 90, 20);
        bg.lineStyle(4, 0x22c55e, 1);
        bg.strokeRoundedRect(-175, -45, 350, 90, 20);
        banner.add(bg);

        const txt1 = this.add.text(0, -14, '⭐ LEVEL 1 CLEARED! ⭐', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '22px',
            color: '#4ade80',
            stroke: '#064e3b',
            strokeThickness: 5
        }).setOrigin(0.5);

        const txt2 = this.add.text(0, 18, 'ADVANCING TO NEXT LEVEL...', {
            fontFamily: '"Arial Black", sans-serif',
            fontSize: '14px',
            color: '#facc15'
        }).setOrigin(0.5);

        banner.add([txt1, txt2]);
        banner.setScale(0.2);

        this.tweens.add({
            targets: banner,
            scaleX: 1.05,
            scaleY: 1.05,
            duration: 350,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: banner,
                    alpha: 0,
                    scaleX: 0.8,
                    scaleY: 0.8,
                    duration: 400,
                    delay: 1400,
                    ease: 'Power2',
                    onComplete: () => banner.destroy()
                });
            }
        });
    }

    handleLevelStart(lv) {
        this.playSynthSound('coin');

        const banner = this.add.container(this.centerX, this.h * 0.26);
        banner.setDepth(300);

        const bg = this.add.graphics();
        bg.fillStyle(0x7f1d1d, 0.95);
        bg.fillRoundedRect(-180, -32, 360, 64, 18);
        bg.lineStyle(3, 0xef4444, 1);
        bg.strokeRoundedRect(-180, -32, 360, 64, 18);
        banner.add(bg);

        const txt = this.add.text(0, 0, '⚠️ LEVEL 2: HARDCORE BOSS WAVE!', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '17px',
            color: '#ffffff',
            stroke: '#450a0a',
            strokeThickness: 5
        }).setOrigin(0.5);
        banner.add(txt);

        banner.setScale(0.3);
        this.tweens.add({
            targets: banner,
            scaleX: 1.0,
            scaleY: 1.0,
            duration: 300,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: banner,
                    y: this.h * 0.18,
                    alpha: 0,
                    duration: 450,
                    delay: 1600,
                    ease: 'Power2',
                    onComplete: () => banner.destroy()
                });
            }
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
        this.time.delayedCall(700, () => {
            this.showVictoryEndCard();
        });
    }

    showVictoryEndCard() {
        const overlay = this.add.graphics();
        overlay.fillStyle(0x020617, 0.85);
        overlay.fillRect(0, 0, this.w, this.h);
        overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.w, this.h), Phaser.Geom.Rectangle.Contains);
        overlay.on('pointerdown', () => this.ShowStore());

        const modal = this.add.container(this.centerX, this.centerY);

        const boxW = Math.min(360, this.w * 0.90);
        const boxH = 430;

        // Modal Frame
        const boxBg = this.add.graphics();
        boxBg.fillStyle(0x0f172a, 0.98);
        boxBg.fillRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 24);
        boxBg.lineStyle(4, 0x38bdf8, 1);
        boxBg.strokeRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 24);
        boxBg.lineStyle(2, 0xffffff, 0.4);
        boxBg.strokeRoundedRect(-boxW / 2 + 5, -boxH / 2 + 5, boxW - 10, boxH - 10, 20);
        modal.add(boxBg);

        // Gold Ribbon Header Banner
        const banner = this.add.graphics();
        banner.fillStyle(0xf59e0b, 1);
        banner.fillRoundedRect(-140, -boxH / 2 - 24, 280, 52, 14);
        banner.lineStyle(3, 0xffffff, 1);
        banner.strokeRoundedRect(-140, -boxH / 2 - 24, 280, 52, 14);
        modal.add(banner);

        const title = this.add.text(0, -boxH / 2 + 2, 'VICTORY!', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '34px',
            color: '#ffffff',
            stroke: '#78350f',
            strokeThickness: 8
        }).setOrigin(0.5);
        modal.add(title);

        const subTitle = this.add.text(0, -boxH / 2 + 55, 'ENEMY CASTLE DESTROYED!', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '16px',
            color: '#38bdf8',
            stroke: '#082f49',
            strokeThickness: 4
        }).setOrigin(0.5);
        modal.add(subTitle);

        // Big Trophy / Medal Emblem
        const trophy = this.add.text(0, -35, '🏆', { fontSize: '64px' }).setOrigin(0.5);
        modal.add(trophy);

        this.tweens.add({
            targets: trophy,
            scaleX: 1.12,
            scaleY: 1.12,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 3 Animated Stars
        const starGroup = this.add.container(0, 30);
        [-65, 0, 65].forEach((sx, i) => {
            const isCenter = i === 1;
            const star = this.add.text(sx, isCenter ? -10 : 0, '⭐', { fontSize: isCenter ? '46px' : '36px' }).setOrigin(0.5);
            star.setScale(0);
            this.tweens.add({
                targets: star,
                scale: 1,
                duration: 450,
                delay: 250 + i * 160,
                ease: 'Back.easeOut'
            });
            starGroup.add(star);
        });
        modal.add(starGroup);

        // Reward Box Pill
        const rewContainer = this.add.container(0, 88);
        const rewBg = this.add.graphics();
        rewBg.fillStyle(0x1e293b, 0.95);
        rewBg.fillRoundedRect(-125, -22, 250, 44, 22);
        rewBg.lineStyle(2, 0xfacc15, 0.9);
        rewBg.strokeRoundedRect(-125, -22, 250, 44, 22);
        rewContainer.add(rewBg);

        const rewCoin = this.add.image(-80, 0, 'icon_coin').setDisplaySize(28, 28);
        const rewText = this.add.text(12, 0, '+10,000 COINS', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '18px',
            color: '#facc15',
            stroke: '#78350f',
            strokeThickness: 4
        }).setOrigin(0.5);
        rewContainer.add([rewCoin, rewText]);
        modal.add(rewContainer);

        // Pulse Green CTA Button
        const ctaBtn = this.add.container(0, boxH / 2 - 50);
        const btnBg = this.add.graphics();
        btnBg.fillStyle(0x22c55e, 1);
        btnBg.fillRoundedRect(-125, -26, 250, 52, 26);
        btnBg.lineStyle(4, 0xffffff, 1);
        btnBg.strokeRoundedRect(-125, -26, 250, 52, 26);
        ctaBtn.add(btnBg);

        const btnText = this.add.text(0, 0, 'PLAY NOW 🔥', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '22px',
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
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        modal.setScale(0);
        this.tweens.add({
            targets: modal,
            scale: 1,
            duration: 500,
            ease: 'Back.easeOut'
        });
    }

    handleDefeat() {
        if (this.isComplete) return;
        this.isComplete = true;

        try {
            this.sound.play('sfx_gameover');
        } catch (e) {
            console.warn(e);
        }

        this.cameras.main.shake(400, 0.02);
        this.time.delayedCall(700, () => {
            this.showDefeatEndCard();
        });
    }

    showDefeatEndCard() {
        const overlay = this.add.graphics();
        overlay.fillStyle(0x05050a, 0.88);
        overlay.fillRect(0, 0, this.w, this.h);
        overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.w, this.h), Phaser.Geom.Rectangle.Contains);
        overlay.on('pointerdown', () => this.ShowStore());

        const modal = this.add.container(this.centerX, this.centerY);

        const boxW = Math.min(360, this.w * 0.90);
        const boxH = 410;

        // Defeat Box Frame
        const boxBg = this.add.graphics();
        boxBg.fillStyle(0x18181b, 0.98);
        boxBg.fillRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 24);
        boxBg.lineStyle(4, 0xef4444, 1);
        boxBg.strokeRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 24);
        boxBg.lineStyle(2, 0xffffff, 0.3);
        boxBg.strokeRoundedRect(-boxW / 2 + 5, -boxH / 2 + 5, boxW - 10, boxH - 10, 20);
        modal.add(boxBg);

        // Header Red Banner
        const banner = this.add.graphics();
        banner.fillStyle(0xdc2626, 1);
        banner.fillRoundedRect(-140, -boxH / 2 - 24, 280, 52, 14);
        banner.lineStyle(3, 0xffffff, 1);
        banner.strokeRoundedRect(-140, -boxH / 2 - 24, 280, 52, 14);
        modal.add(banner);

        const title = this.add.text(0, -boxH / 2 + 2, 'DEFEAT!', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '34px',
            color: '#ffffff',
            stroke: '#450a0a',
            strokeThickness: 8
        }).setOrigin(0.5);
        modal.add(title);

        const subTitle = this.add.text(0, -boxH / 2 + 55, 'DEFENSE BREACHED!', {
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: '16px',
            color: '#f87171',
            stroke: '#450a0a',
            strokeThickness: 4
        }).setOrigin(0.5);
        modal.add(subTitle);

        // Skull / Broken Icon
        const icon = this.add.text(0, -30, '💀', { fontSize: '64px' }).setOrigin(0.5);
        modal.add(icon);

        this.tweens.add({
            targets: icon,
            y: -24,
            duration: 750,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Tip text box
        const tipContainer = this.add.container(0, 48);
        const tipBg = this.add.graphics();
        tipBg.fillStyle(0x27272a, 0.9);
        tipBg.fillRoundedRect(-135, -20, 270, 40, 12);
        tipBg.lineStyle(1.5, 0xef4444, 0.5);
        tipBg.strokeRoundedRect(-135, -20, 270, 40, 12);
        tipContainer.add(tipBg);

        const tipText = this.add.text(0, 0, '💡 Multiply mobs with Gates & Pipes!', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            color: '#e2e8f0',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        tipContainer.add(tipText);
        modal.add(tipContainer);

        // Retry CTA Button
        const ctaBtn = this.add.container(0, boxH / 2 - 50);
        const btnBg = this.add.graphics();
        btnBg.fillStyle(0xef4444, 1);
        btnBg.fillRoundedRect(-125, -26, 250, 52, 26);
        btnBg.lineStyle(4, 0xffffff, 1);
        btnBg.strokeRoundedRect(-125, -26, 250, 52, 26);
        ctaBtn.add(btnBg);

        const btnText = this.add.text(0, 0, 'TRY AGAIN 🔄', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '22px',
            color: '#ffffff',
            stroke: '#7f1d1d',
            strokeThickness: 6
        }).setOrigin(0.5);
        ctaBtn.add(btnText);
        modal.add(ctaBtn);

        this.tweens.add({
            targets: ctaBtn,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 600,
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
        
        if (typeof window.gameEnd === 'function') {
                    window.gameEnd();
                }

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