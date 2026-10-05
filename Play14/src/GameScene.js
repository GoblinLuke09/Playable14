import Phaser from 'phaser';
import { Game3D } from './Game3D.js';

// Import sound assets for Vite bundling & single-file inlining
import sfxClick from './assets/Sound/click.mp3';
import sfxComplete from './assets/Sound/levelcomplete.mp3';
import sfxGameover from './assets/Sound/gameover.mp3';
import handImg from './assets/images/hand.webp';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        try {
            this.load.audio('sfx_click', sfxClick);
            this.load.audio('sfx_complete', sfxComplete);
            this.load.audio('sfx_gameover', sfxGameover);
            this.load.image('icon_hand', handImg);
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
        this.hasTriggeredStore = false;

        window.showStore = () => this.ShowStore();
        window.ShowStore = () => this.ShowStore();

        this.initWebAudioSynth();

        if (this.game && this.game.canvas) {
            this.game.canvas.style.position = 'absolute';
            this.game.canvas.style.top = '0';
            this.game.canvas.style.left = '0';
            this.game.canvas.style.zIndex = '10';
        }

        // Initialize 3D Engine with Model Skin_BF14.glb & shooter runner mechanics
        const container = document.getElementById('game-container');
        this.game3d = new Game3D(container, {
            onHit: (data) => this.handleHit(data),
            onShoot: () => this.handleShoot(),
            onPowerUp: (data) => this.handlePowerUp(data),
            onSquadCountChange: (count) => this.handleSquadCountChange(count),
            onCoinCollect: (data) => this.handleCoinCollect(data),
            onLevelComplete: () => this.handleVictory()
        });

        // Tutorial drag hint during start (Only UI kept)
        this.createTutorialHint();

        // Input listeners
        this.input.on('pointerdown', (pointer) => {
            if (!this.gameStarted) {
                this.startGame();
                            // Notify Playturbo
                if (typeof window.gameReady === 'function') {
                    window.gameReady();
                }
            }
            if (this.game3d) {
                this.game3d.isGameActive = true;
            }


        });

        this.input.on('pointermove', (pointer) => {
            if (pointer.isDown && this.game3d) {
                this.game3d.isGameActive = true;
                const normX = (pointer.x - this.centerX) / (this.w * 0.45);
                this.game3d.targetPlayerX = Phaser.Math.Clamp(-1.0 - normX * 3.6, this.game3d.minPlayerX, this.game3d.maxPlayerX);



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

        if (type === 'laser') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(680, now);
            osc.frequency.exponentialRampToValueAtTime(160, now + 0.05);

            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.06);
        } else if (type === 'chop') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(220 + Math.random() * 50, now);
            osc.frequency.exponentialRampToValueAtTime(55, now + 0.08);

            gain.gain.setValueAtTime(0.28, now);
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
        } else if (type === 'gate' || type === 'powerup') {
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.04);

                gain.gain.setValueAtTime(0.2, now + i * 0.04);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.04 + 0.22);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.04);
                osc.stop(now + i * 0.04 + 0.23);
            });
        }
    }

    createTutorialHint() {
        this.tutorialGroup = this.add.container(this.centerX, this.h * 0.72);

        // Moving hand container (sweeps left-right horizontally)
        const handContainer = this.add.container(-65, 0);

        // Green pulse tap ripple
        const ripple = this.add.graphics();
        ripple.lineStyle(3, 0x84cc16, 0.9);
        ripple.strokeCircle(-48, -62, 22);
        ripple.fillStyle(0x84cc16, 0.45);
        ripple.fillCircle(-48, -62, 14);

        // Cartoon Glove Hand from hand.webp
        const hand = this.add.image(0, 0, 'icon_hand').setScale(0.85);

        handContainer.add([ripple, hand]);

        // "Hold to Shoot" text matching reference image
        const text = this.add.text(0, 88, 'Hold to Shoot', {
            fontFamily: '"Arial Black", "Montserrat", "Impact", sans-serif',
            fontSize: '38px',
            color: '#ffffff',
            stroke: '#1e1b4b',
            strokeThickness: 10,
            shadow: {
                offsetX: 0,
                offsetY: 4,
                color: '#0f172a',
                blur: 8,
                stroke: true,
                fill: true
            }
        }).setOrigin(0.5);

        this.tutorialGroup.add([handContainer, text]);

        // Left-Right horizontal sweeping motion
        this.tweens.add({
            targets: handContainer,
            x: 65,
            duration: 850,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Ripple pulse
        this.tweens.add({
            targets: ripple,
            scaleX: 1.4,
            scaleY: 1.4,
            alpha: 0.15,
            duration: 650,
            yoyo: false,
            repeat: -1,
            ease: 'Cubic.easeOut'
        });

        // Text breathing pulse
        this.tweens.add({
            targets: text,
            scaleX: 1.05,
            scaleY: 1.05,
            duration: 550,
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

        // Tự động showStore sau 8s kể từ khi bắt đầu chơi (kích hoạt 1 lần duy nhất)
        this.time.delayedCall(8000, () => {
            this.ShowStore();
        });
    }

    handleShoot() {
        this.playSynthSound('laser');
    }

    handleHit(data) {
        this.playSynthSound('chop');
        this.cameras.main.shake(40, 0.002);
    }

    handlePowerUp(data) {
        this.playSynthSound('powerup');
        if (data.type === 'gun') {
            this.showFloatPopup('AK-47 UNLOCKED! 🔥', 0xfacc15);
        } else if (data.type === 'gate') {
            this.showFloatPopup(`+${data.val} FIREPOWER! ⚡`, 0x38bdf8);
        }
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

        if (this.game3d) {
            this.game3d.isGameActive = false;
        }

        if (typeof window.gameEnd === 'function') {
            window.gameEnd();
        }

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